// Shared constants for the single-screen preview flow

export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const DEFAULT_SIZE_ID = '40x50' as const

export const MAX_FILE_SIZE_MB = 10

export const UX_COPY = {
  upload: 'Upload a photo',
  uploadHelper: 'Upload a photo to begin',
  preparing: 'Preparing preview…',
  processing: 'Transforming your image…',
  ready: 'Your preview is ready',
  selectSize: 'Select canvas size',
  buyCta: 'Order your kit',
  replaceImage: 'Replace photo',
  retry: 'Try again',
  errorBadFile: 'That file could not be processed. Try a different photo.',
} as const
