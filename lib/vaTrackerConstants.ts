// Shared constants for VA Tracker (Client & Server safe)

export const VA_STATUS_OPTIONS = [
  'Sent E-Sign',
  'Sign Follow Up',
  'Signed E-Sign',
  'Client Refused Help',
  'Case Rejected',
] as const

export const VA_OUTCOME_REASONS = [
  'Already Represented',
  'Not interested',
  'Fee is too high',
  'Say they will call back',
  'Second Hang Up',
  'Client will review FA',
  'Other',
] as const
