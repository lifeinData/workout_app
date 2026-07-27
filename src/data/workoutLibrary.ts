import { Equipment } from '../state/trainingStore';

export type WorkoutTag = 'Push' | 'Pull' | 'Legs' | 'Full Body' | 'Conditioning';
export type Location = 'home' | 'gym' | 'either';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: Equipment[];
  /** YouTube video ID. Build a watch URL via youtubeUrl() and a thumb via youtubeThumb(). */
  ytId: string;
  defaultSets: number;
  defaultRepsLabel: string; // e.g. "6-8"
  prTrackable?: boolean;
}

export interface Workout {
  id: string;
  name: string;
  tag: WorkoutTag;
  location: Location;
  equipment: Equipment[];
  durationMin: number;
  exercises: Exercise[];
}

export const youtubeUrl = (id: string) => `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
export const youtubeThumb = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

export const WORKOUTS: Workout[] = [
  {
    id: 'w-upper-power', name: 'Upper Body Power', tag: 'Push',
    location: 'gym', equipment: ['barbell', 'dumbbells', 'cable'], durationMin: 60,
    exercises: [
      { id: 'ex-bench',         name: 'Barbell Bench Press',    muscleGroup: 'Chest',     equipment: ['barbell'],   ytId: 'rT7DgCr-3pg', defaultSets: 4, defaultRepsLabel: '6-8',   prTrackable: true },
      { id: 'ex-incline-db',    name: 'Incline Dumbbell Press', muscleGroup: 'Chest',     equipment: ['dumbbells'], ytId: '8iPEnn-ltC8', defaultSets: 3, defaultRepsLabel: '8-10' },
      { id: 'ex-cable-fly',     name: 'Cable Flyes',            muscleGroup: 'Chest',     equipment: ['cable'],     ytId: 'Iwe6AmxVf7o', defaultSets: 3, defaultRepsLabel: '12-15' },
      { id: 'ex-ohp',           name: 'Overhead Press',         muscleGroup: 'Shoulders', equipment: ['barbell'],   ytId: '2yjwXTZQDDI', defaultSets: 4, defaultRepsLabel: '6-8',   prTrackable: true },
      { id: 'ex-lateral',       name: 'Lateral Raises',         muscleGroup: 'Shoulders', equipment: ['dumbbells'], ytId: 'OuG1smZTsQQ', defaultSets: 3, defaultRepsLabel: '12-15' },
    ],
  },
  {
    id: 'w-pull-day', name: 'Pull Day', tag: 'Pull',
    location: 'gym', equipment: ['barbell', 'cable', 'dumbbells'], durationMin: 55,
    exercises: [
      { id: 'ex-deadlift',  name: 'Conventional Deadlift', muscleGroup: 'Back',   equipment: ['barbell'],   ytId: 'op9kVnSso6Q', defaultSets: 4, defaultRepsLabel: '3-5', prTrackable: true },
      { id: 'ex-pullup',    name: 'Pull-ups',              muscleGroup: 'Back',   equipment: ['bodyweight'],ytId: 'eGo4IYlbE5g', defaultSets: 4, defaultRepsLabel: 'AMRAP', prTrackable: true },
      { id: 'ex-row',       name: 'Barbell Row',           muscleGroup: 'Back',   equipment: ['barbell'],   ytId: 'vT2GjY_Umpw', defaultSets: 3, defaultRepsLabel: '8-10' },
      { id: 'ex-curl',      name: 'DB Bicep Curl',         muscleGroup: 'Biceps', equipment: ['dumbbells'], ytId: 'ykJmrZ5v0Oo', defaultSets: 3, defaultRepsLabel: '10-12' },
    ],
  },
  {
    id: 'w-leg-day', name: 'Leg Day', tag: 'Legs',
    location: 'gym', equipment: ['barbell', 'machine'], durationMin: 65,
    exercises: [
      { id: 'ex-squat',     name: 'Back Squat',         muscleGroup: 'Quads',     equipment: ['barbell'], ytId: 'ultWZbUMPL8', defaultSets: 5, defaultRepsLabel: '5',  prTrackable: true },
      { id: 'ex-rdl',       name: 'Romanian Deadlift',  muscleGroup: 'Hamstrings',equipment: ['barbell'], ytId: 'jEy_czb3RKA', defaultSets: 4, defaultRepsLabel: '8-10' },
      { id: 'ex-legpress',  name: 'Leg Press',          muscleGroup: 'Quads',     equipment: ['machine'], ytId: 'IZxyjW7MPJQ', defaultSets: 3, defaultRepsLabel: '10-12' },
      { id: 'ex-calf',      name: 'Calf Raises',        muscleGroup: 'Calves',    equipment: ['machine'], ytId: 'JbyjNymZOt0', defaultSets: 4, defaultRepsLabel: '12-15' },
    ],
  },
  {
    id: 'w-home-db-upper', name: 'Home Dumbbell Upper', tag: 'Push',
    location: 'home', equipment: ['dumbbells'], durationMin: 35,
    exercises: [
      { id: 'ex-db-press',  name: 'DB Floor Press',     muscleGroup: 'Chest',     equipment: ['dumbbells'], ytId: 'qOSb86_LDXE', defaultSets: 4, defaultRepsLabel: '8-10' },
      { id: 'ex-db-row',    name: 'DB Bent Row',        muscleGroup: 'Back',      equipment: ['dumbbells'], ytId: 'roCP6wCXPqo', defaultSets: 4, defaultRepsLabel: '10' },
      { id: 'ex-db-press-sh', name: 'DB Shoulder Press',muscleGroup: 'Shoulders', equipment: ['dumbbells'], ytId: 'qEwKCR5JCog', defaultSets: 3, defaultRepsLabel: '10-12' },
      { id: 'ex-db-curl',   name: 'DB Curl',            muscleGroup: 'Biceps',    equipment: ['dumbbells'], ytId: 'ykJmrZ5v0Oo', defaultSets: 3, defaultRepsLabel: '12' },
    ],
  },
  {
    id: 'w-home-bw', name: 'No-Equipment Burner', tag: 'Full Body',
    location: 'home', equipment: ['bodyweight'], durationMin: 25,
    exercises: [
      { id: 'ex-pushup',     name: 'Push-ups',           muscleGroup: 'Chest',  equipment: ['bodyweight'], ytId: 'IODxDxX7oi4', defaultSets: 4, defaultRepsLabel: 'AMRAP' },
      { id: 'ex-airsquat',   name: 'Air Squats',         muscleGroup: 'Quads',  equipment: ['bodyweight'], ytId: 'aclHkVaku9U', defaultSets: 4, defaultRepsLabel: '20' },
      { id: 'ex-lunge',      name: 'Walking Lunges',     muscleGroup: 'Legs',   equipment: ['bodyweight'], ytId: 'L8fvypPrzzs', defaultSets: 3, defaultRepsLabel: '12/leg' },
      { id: 'ex-plank',      name: 'Plank',              muscleGroup: 'Core',   equipment: ['bodyweight'], ytId: 'pSHjTRCQxIw', defaultSets: 3, defaultRepsLabel: '45 sec' },
    ],
  },
  {
    id: 'w-home-band', name: 'Resistance Band Pull', tag: 'Pull',
    location: 'home', equipment: ['bands'], durationMin: 30,
    exercises: [
      { id: 'ex-band-row',    name: 'Band Bent Row',      muscleGroup: 'Back',     equipment: ['bands'], ytId: 'fH6KK_T8X28', defaultSets: 4, defaultRepsLabel: '15' },
      { id: 'ex-band-pull',   name: 'Band Pull-Apart',    muscleGroup: 'Rear Delt',equipment: ['bands'], ytId: 'I_5wIYzzUmU', defaultSets: 3, defaultRepsLabel: '20' },
      { id: 'ex-band-curl',   name: 'Band Curl',          muscleGroup: 'Biceps',   equipment: ['bands'], ytId: 'NFzTWp2qpiE', defaultSets: 3, defaultRepsLabel: '15' },
    ],
  },
  {
    id: 'w-kb-conditioning', name: 'Kettlebell Conditioning', tag: 'Conditioning',
    location: 'either', equipment: ['kettlebell'], durationMin: 20,
    exercises: [
      { id: 'ex-kb-swing',  name: 'Kettlebell Swing',  muscleGroup: 'Posterior', equipment: ['kettlebell'], ytId: 'sSESeQRpA08', defaultSets: 5, defaultRepsLabel: '20' },
      { id: 'ex-kb-goblet', name: 'Goblet Squat',      muscleGroup: 'Quads',     equipment: ['kettlebell'], ytId: 'MeIiIdhvXT4', defaultSets: 4, defaultRepsLabel: '12' },
      { id: 'ex-kb-press',  name: 'KB Shoulder Press', muscleGroup: 'Shoulders', equipment: ['kettlebell'], ytId: 'lFV9NQpWAQU', defaultSets: 4, defaultRepsLabel: '8/side' },
    ],
  },
  {
    id: 'w-full-body-gym', name: 'Full Body Strength', tag: 'Full Body',
    location: 'gym', equipment: ['barbell', 'dumbbells'], durationMin: 50,
    exercises: [
      { id: 'ex-squat',     name: 'Back Squat',          muscleGroup: 'Quads',    equipment: ['barbell'],   ytId: 'ultWZbUMPL8', defaultSets: 3, defaultRepsLabel: '5', prTrackable: true },
      { id: 'ex-bench',     name: 'Barbell Bench Press', muscleGroup: 'Chest',    equipment: ['barbell'],   ytId: 'rT7DgCr-3pg', defaultSets: 3, defaultRepsLabel: '5', prTrackable: true },
      { id: 'ex-row',       name: 'Barbell Row',         muscleGroup: 'Back',     equipment: ['barbell'],   ytId: 'vT2GjY_Umpw', defaultSets: 3, defaultRepsLabel: '8' },
    ],
  },
];

export const EQUIPMENT_LIST: { id: Equipment; label: string }[] = [
  { id: 'bodyweight', label: 'Bodyweight' },
  { id: 'dumbbells',  label: 'Dumbbells' },
  { id: 'bands',      label: 'Bands' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'barbell',    label: 'Barbell' },
  { id: 'cable',      label: 'Cable' },
  { id: 'machine',    label: 'Machine' },
];
