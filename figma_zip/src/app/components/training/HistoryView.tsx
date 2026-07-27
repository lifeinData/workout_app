import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trophy } from 'lucide-react';
import { useTrainingStore } from '../../state/trainingStore';
import { WORKOUTS, Exercise } from './workoutLibrary';

export function HistoryView() {
  const history = useTrainingStore(s => s.history);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Build exercise lookup
  const exerciseMap = useMemo(() => {
    const map = new Map<string, Exercise>();
    WORKOUTS.forEach(w => w.exercises.forEach(e => map.set(e.id, e)));
    return map;
  }, []);

  // Get all dates that have history
  const datesWithHistory = useMemo(() => {
    return new Set(Object.keys(history));
  }, [history]);

  // Generate calendar days for current month
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty slots for days before month starts
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    // Add actual days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  }, [currentMonth]);

  const selectedDayHistory = selectedDate ? history[selectedDate] : null;

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const formatDate = (date: Date) => {
    return date.toISOString().slice(0, 10);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear();
  };

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="bg-card rounded-3xl p-4 border border-border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-card-foreground flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-primary" />
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={prevMonth}
              className="w-8 h-8 rounded-lg bg-muted hover:bg-secondary flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextMonth}
              className="w-8 h-8 rounded-lg bg-muted hover:bg-secondary flex items-center justify-center transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center text-xs text-muted-foreground py-1">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, idx) => {
            if (!day) {
              return <div key={`empty-${idx}`} className="aspect-square" />;
            }

            const dateStr = formatDate(day);
            const hasHistory = datesWithHistory.has(dateStr);
            const isSelected = dateStr === selectedDate;
            const isTodayDate = isToday(day);

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`aspect-square rounded-lg text-sm transition-all relative ${
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : hasHistory
                    ? 'bg-accent text-accent-foreground hover:bg-accent/80'
                    : 'hover:bg-muted text-muted-foreground'
                } ${isTodayDate && !isSelected ? 'ring-2 ring-primary ring-inset' : ''}`}
              >
                {day.getDate()}
                {hasHistory && !isSelected && (
                  <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDayHistory && selectedDate && (
        <div className="bg-card rounded-3xl p-5 border border-border shadow-sm">
          <h3 className="text-card-foreground mb-4">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric'
            })}
          </h3>

          <div className="space-y-4">
            {Object.entries(selectedDayHistory).map(([exerciseId, sets]) => {
              const exercise = exerciseMap.get(exerciseId);
              if (!exercise) return null;

              return (
                <div key={exerciseId} className="border-t border-border pt-4 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-card-foreground">{exercise.name}</h4>
                    {exercise.prTrackable && <Trophy className="w-3.5 h-3.5 text-primary" />}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">{exercise.muscleGroup}</div>

                  <div className="space-y-1">
                    {sets.map((set, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-sm bg-muted/40 rounded-lg px-3 py-2"
                      >
                        <span className="text-muted-foreground">Set {idx + 1}</span>
                        <span className="text-card-foreground tabular-nums">
                          {set.weight} lb × {set.reps} reps
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(set.timestamp).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    Total volume: {sets.reduce((sum, s) => sum + (s.weight * s.reps), 0).toLocaleString()} lb
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!selectedDate && (
        <div className="bg-muted/50 rounded-3xl p-8 text-center text-sm text-muted-foreground border border-dashed border-border">
          Select a date to view your workout history
        </div>
      )}
    </div>
  );
}
