// Shared constants for SSD Tracker (Client & Server safe)

export const SSD_STATUS_OPTIONS = [
  'Sent E-Sign',
  'Paper Retainer Sent',
  'Signed E-Sign',
  'Client Refused Help',
  'Case Rejected',
  'Sent RFC',
  'Appointment Rescheduled',
] as const

export const SSD_CLAIM_TYPES = [
  'SSDI+SSI',
  'SSDI Only',
  'SSI Only',
  'DWB',
] as const

export const SSD_OUTCOME_REASONS = [
  'Not interested',
  'Already Represented',
  'Not sufficiently disabled',
  'Lead is working full time',
  'Leading is more than allowed',
  'Other',
] as const
