"""Workout session lifecycle.

A `WorkoutSession` is the durable spine the training tab hangs off: one
row per "I did Push Day A on 2026-08-01", holding the sets logged
against it. Exactly one session per user may be `status == "active"`
at a time — enforced here in the router (SQLite has no portable
partial-unique-index syntax across our supported dialects).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlmodel import Session, select

from app.db import get_session
from app.deps import get_current_user
from app.models import Exercise, HistoricalSet, User, Workout, WorkoutExerciseLink, WorkoutSession
from app.prs import recompute_pr
from app.schemas import (
    ExerciseResponse,
    HistoricalSetResponse,
    SessionCreate,
    SessionDetailResponse,
    SessionExerciseBlock,
    SessionPatch,
    SessionSummaryResponse,
)
from app.timefmt import utc_now_iso

router = APIRouter(prefix="/me", tags=["sessions"])

# A session left "active" for longer than this is treated as forgotten
# (app killed, phone died) rather than genuinely still in progress.
STALE_SESSION_HOURS = 24

# Ad-hoc blocks (an exercise logged in a session with no prescription —
# either an empty workout, or an addition on top of a prescribed one)
# get these defaults, matching `WorkoutExerciseLink`'s own schema
# defaults so the two paths render consistently.
_ADHOC_TARGET_SETS = 3
_ADHOC_TARGET_REPS = 10
_ADHOC_TARGET_WEIGHT_KG = None
_ADHOC_TARGET_REST_SEC = 60


# ---------------------------------------------------------------------------
# Local helpers
# ---------------------------------------------------------------------------


def _parse_iso(ts: str) -> datetime:
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def _hours_since(iso_ts: str) -> float:
    return (datetime.now(timezone.utc) - _parse_iso(iso_ts)).total_seconds() / 3600


def _duration_sec(started_at: str, ended_at: str | None) -> int:
    start = _parse_iso(started_at)
    end = _parse_iso(ended_at) if ended_at else datetime.now(timezone.utc)
    return max(0, int((end - start).total_seconds()))


def _last_time_sets(
    db: Session, user_id: str, exercise_id: str, exclude_session_id: str
) -> list[HistoricalSet]:
    """All sets from the most recent OTHER session that logged this
    exercise (any status). Empty if this exercise has never been
    logged before.
    """
    rows = db.exec(
        select(HistoricalSet)
        .where(HistoricalSet.user_id == user_id)
        .where(HistoricalSet.exercise_id == exercise_id)
        .where(HistoricalSet.session_id != exclude_session_id)
        .order_by(HistoricalSet.timestamp.desc(), HistoricalSet.id.desc())
    ).all()
    if not rows:
        return []
    most_recent_session_id = rows[0].session_id
    same_session = [r for r in rows if r.session_id == most_recent_session_id]
    same_session.sort(key=lambda s: s.set_index)
    return same_session


def _make_block(
    db: Session,
    ws: WorkoutSession,
    ex: Exercise,
    order_index: int,
    target_sets: int,
    target_reps: int,
    target_weight_kg: float | None,
    target_rest_sec: int,
    prescription_notes: str | None,
    sets: list[HistoricalSet],
    is_prescribed: bool = False,
) -> SessionExerciseBlock:
    last_time = _last_time_sets(db, ws.user_id, ex.id, ws.id)
    return SessionExerciseBlock(
        exercise=ExerciseResponse.model_validate(ex),
        order_index=order_index,
        target_sets=target_sets,
        target_reps=target_reps,
        target_weight_kg=target_weight_kg,
        target_rest_sec=target_rest_sec,
        prescription_notes=prescription_notes,
        is_prescribed=is_prescribed,
        sets=[HistoricalSetResponse.model_validate(s) for s in sets],
        last_time=[HistoricalSetResponse.model_validate(s) for s in last_time],
    )


def _build_blocks(db: Session, ws: WorkoutSession) -> list[SessionExerciseBlock]:
    """Assemble this session's exercise blocks.

    If the session has a `workout_id`, blocks come from that workout's
    prescriptions in `order_index` order first; any exercise logged in
    this session that ISN'T in the prescription (an ad-hoc addition) is
    appended afterwards, ordered by when it was first logged. An
    ad-hoc session (`workout_id is None`) is just that second pass.
    """
    # Ordered by `id` (the autoincrement PK), not `timestamp` — two
    # sets logged within the same second get identical
    # second-resolution timestamps, and a timestamp-string sort would
    # silently tie-break to whatever order the *next* query happened
    # to return them in. `id` is monotonically increasing at insert
    # time regardless of clock resolution, so it's the only reliable
    # proxy for "which was logged first".
    set_rows = db.exec(
        select(HistoricalSet)
        .where(HistoricalSet.session_id == ws.id)
        .order_by(HistoricalSet.id)
    ).all()

    sets_by_exercise: dict[str, list[HistoricalSet]] = {}
    first_seen_order: list[str] = []
    for s in set_rows:
        if s.exercise_id not in sets_by_exercise:
            sets_by_exercise[s.exercise_id] = []
            first_seen_order.append(s.exercise_id)
        sets_by_exercise[s.exercise_id].append(s)

    blocks: list[SessionExerciseBlock] = []
    seen: set[str] = set()

    if ws.workout_id is not None:
        links = db.exec(
            select(WorkoutExerciseLink)
            .where(WorkoutExerciseLink.workout_id == ws.workout_id)
            .order_by(WorkoutExerciseLink.order_index, WorkoutExerciseLink.exercise_id)
        ).all()
        ex_by_id: dict[str, Exercise] = {}
        if links:
            ex_rows = db.exec(
                select(Exercise).where(Exercise.id.in_([link.exercise_id for link in links]))
            ).all()
            ex_by_id = {e.id: e for e in ex_rows}
        for link in links:
            ex = ex_by_id.get(link.exercise_id)
            if ex is None:
                continue  # exercise deleted out from under the link; skip defensively
            seen.add(link.exercise_id)
            blocks.append(
                _make_block(
                    db,
                    ws,
                    ex,
                    link.order_index,
                    link.target_sets,
                    link.target_reps,
                    link.target_weight_kg,
                    link.target_rest_sec,
                    link.prescription_notes,
                    sets_by_exercise.get(link.exercise_id, []),
                    is_prescribed=True,
                )
            )

    adhoc_ids = [eid for eid in first_seen_order if eid not in seen]
    if adhoc_ids:
        ex_rows = db.exec(select(Exercise).where(Exercise.id.in_(adhoc_ids))).all()
        ex_by_id = {e.id: e for e in ex_rows}
        for eid in adhoc_ids:
            ex = ex_by_id.get(eid)
            if ex is None:
                continue
            blocks.append(
                _make_block(
                    db,
                    ws,
                    ex,
                    len(blocks),
                    _ADHOC_TARGET_SETS,
                    _ADHOC_TARGET_REPS,
                    _ADHOC_TARGET_WEIGHT_KG,
                    _ADHOC_TARGET_REST_SEC,
                    None,
                    sets_by_exercise[eid],
                )
            )

    return blocks


def build_session_detail(db: Session, ws: WorkoutSession) -> SessionDetailResponse:
    blocks = _build_blocks(db, ws)
    total_sets = 0
    total_volume_kg = 0.0
    for block in blocks:
        for s in block.sets:
            if s.kind == "working":
                total_sets += 1
                total_volume_kg += s.weight_kg * s.reps
    return SessionDetailResponse(
        id=ws.id,
        user_id=ws.user_id,
        workout_id=ws.workout_id,
        name=ws.name,
        local_date=ws.local_date,
        tz_offset_min=ws.tz_offset_min,
        started_at=ws.started_at,
        ended_at=ws.ended_at,
        status=ws.status,
        notes=ws.notes,
        blocks=blocks,
        total_sets=total_sets,
        total_volume_kg=total_volume_kg,
        duration_sec=_duration_sec(ws.started_at, ws.ended_at),
    )


def _build_summary(db: Session, ws: WorkoutSession) -> SessionSummaryResponse:
    sets = db.exec(select(HistoricalSet).where(HistoricalSet.session_id == ws.id)).all()
    working = [s for s in sets if s.kind == "working"]
    return SessionSummaryResponse(
        id=ws.id,
        workout_id=ws.workout_id,
        name=ws.name,
        local_date=ws.local_date,
        started_at=ws.started_at,
        ended_at=ws.ended_at,
        status=ws.status,
        total_sets=len(working),
        total_volume_kg=sum(s.weight_kg * s.reps for s in working),
        duration_sec=_duration_sec(ws.started_at, ws.ended_at),
        exercise_count=len({s.exercise_id for s in sets}),
        pr_count=sum(1 for s in working if s.was_pr),
    )


def _get_active_session(db: Session, user_id: str) -> WorkoutSession | None:
    return db.exec(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user_id)
        .where(WorkoutSession.status == "active")
    ).first()


def _get_owned_session_or_404(db: Session, session_id: str, user_id: str) -> WorkoutSession:
    ws = db.get(WorkoutSession, session_id)
    if ws is None or ws.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return ws


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post(
    "/sessions",
    response_model=SessionDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    body: SessionCreate,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SessionDetailResponse:
    """Start a session, or return the already-active one.

    Idempotent: if the user already has an active session, it is
    returned as-is with a 200 (the decorator's 201 default is
    overridden) instead of starting a second one.
    """
    existing = _get_active_session(db, user.id)
    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return build_session_detail(db, existing)

    name = body.name
    if body.workout_id is not None:
        w = db.get(Workout, body.workout_id)
        # Personal (owner_id is not None) `Workout` rows no longer exist
        # (see "no more templates" rework) — a workout is startable only
        # if it's in the coach catalog (owner_id is None). The
        # owner_id-mismatch branch is kept defensively rather than
        # simplified to `w.owner_id is not None`, in case old rows
        # linger in an unmigrated dev DB.
        if w is None or (w.owner_id is not None and w.owner_id != user.id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
        if name is None:
            name = w.name
    if name is None:
        name = "Workout"

    new_session = WorkoutSession(
        id=f"ses-{uuid.uuid4().hex[:12]}",
        user_id=user.id,
        workout_id=body.workout_id,
        name=name,
        local_date=body.local_date,
        tz_offset_min=body.tz_offset_min,
        started_at=utc_now_iso(),
        status="active",
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return build_session_detail(db, new_session)


@router.get("/sessions/active", response_model=SessionDetailResponse | None)
def get_active_session(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SessionDetailResponse | None:
    active = _get_active_session(db, user.id)
    if active is None:
        return None
    if _hours_since(active.started_at) > STALE_SESSION_HOURS:
        active.status = "abandoned"
        active.ended_at = utc_now_iso()
        db.add(active)
        db.commit()
        return None
    return build_session_detail(db, active)


@router.get("/sessions", response_model=list[SessionSummaryResponse])
def list_sessions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
    from_: str | None = Query(default=None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    to: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[SessionSummaryResponse]:
    stmt = select(WorkoutSession).where(WorkoutSession.user_id == user.id)
    if from_:
        stmt = stmt.where(WorkoutSession.local_date >= from_)
    if to:
        stmt = stmt.where(WorkoutSession.local_date <= to)
    stmt = stmt.order_by(WorkoutSession.local_date.desc(), WorkoutSession.started_at.desc())
    rows = db.exec(stmt.limit(limit).offset(offset)).all()
    return [_build_summary(db, ws) for ws in rows]


@router.get("/sessions/{session_id}", response_model=SessionDetailResponse)
def get_session_detail(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SessionDetailResponse:
    ws = _get_owned_session_or_404(db, session_id, user.id)
    return build_session_detail(db, ws)


@router.patch("/sessions/{session_id}", response_model=SessionDetailResponse)
def patch_session(
    session_id: str,
    body: SessionPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> SessionDetailResponse:
    ws = _get_owned_session_or_404(db, session_id, user.id)

    if body.status is not None:
        if ws.status != "active":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Session is already {ws.status}",
            )
        ws.status = body.status
        ws.ended_at = utc_now_iso()
    if body.notes is not None:
        ws.notes = body.notes
    # Rename is allowed in any status — renaming a past session in
    # history is a legitimate edit, not just an active-session action.
    if body.name is not None:
        ws.name = body.name

    db.add(ws)
    db.commit()
    db.refresh(ws)
    return build_session_detail(db, ws)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Response:
    ws = _get_owned_session_or_404(db, session_id, user.id)

    sets = db.exec(select(HistoricalSet).where(HistoricalSet.session_id == session_id)).all()
    affected_exercise_ids = {s.exercise_id for s in sets}
    for s in sets:
        db.delete(s)
    db.delete(ws)
    db.flush()

    for exercise_id in affected_exercise_ids:
        recompute_pr(db, user.id, exercise_id)

    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# "My Workouts" — the caller's own past sessions
# ---------------------------------------------------------------------------
#
# Personal `Workout` templates (owner_id = the user) no longer exist —
# see the 2026-08-22 "no more templates" rework. "My Workouts" is now a
# read of the user's own COMPLETED WorkoutSessions; tapping one re-opens
# that past session for in-place editing rather than starting a fresh
# copy from a saved template. `owner_id` stays on the `Workout` model
# (Coach's Playbook depends on `owner_id IS NULL`), but nothing writes
# it anymore.


@router.get("/workouts", response_model=list[SessionSummaryResponse])
def list_my_workouts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[SessionSummaryResponse]:
    """The caller's own past workouts — the "My Workouts" tab.

    Returns completed `WorkoutSession`s (not `Workout` templates —
    those no longer exist for personal use), most recent first. Coach
    catalog templates (`Workout.owner_id IS NULL`) live at the public
    `GET /workouts`.
    """
    stmt = (
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user.id)
        .where(WorkoutSession.status == "completed")
        .order_by(WorkoutSession.local_date.desc(), WorkoutSession.started_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = db.exec(stmt).all()
    return [_build_summary(db, ws) for ws in rows]
