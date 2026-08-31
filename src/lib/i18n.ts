/**
 * English (en) copy for the web interface.
 *
 * Centralised so the UI layer holds no hard-coded language and a second locale is a
 * drop-in addition.
 *
 * NOTE: the Telegram bot deliberately speaks **Persian** — its replies live in
 * `src/server/telegram/bot.ts` and `src/server/telegram/runtime.ts` (STANDBY_REPLY)
 * and are intentionally NOT part of this dictionary.
 */
export const en = {
  // ---- Header / shell ----
  appTagline: (tracks: number, playlists: number) =>
    `Self-hosted audio · ${tracks} tracks · ${playlists} playlists`,
  upload: "Upload",
  playlists: "Playlists",
  admin: "Admin",
  staff: "Staff",
  signOut: "Sign out",
  shuffleAll: "Shuffle",
  shuffleAllTitle: "Randomise the order of this playlist",
  shuffleDone: "Playlist shuffled",
  shuffleNeedsTracks: "Shuffle needs at least two tracks",

  // ---- Library section ----
  nowCuring: "Now curating",
  noPlaylist: "No playlist",
  emptyPlaylistHint: "Create a playlist to start shaping the room's atmosphere.",
  trackCount: (count: number, duration: string) => `${count} tracks · ${duration}`,
  dragHint: " · drag the handles to reorder",
  searchPlaceholder: "Search this playlist",
  guestNotice: "Browsing as a guest — playback is open to everyone.",
  guestSignIn: "Sign in",
  guestUploadHint: (allowed: boolean) =>
    allowed
      ? " to upload or manage the library."
      : " to upload (admins only right now) or manage the library.",

  // ---- Playlist board ----
  emptyBoardTitle: "This playlist is empty",
  emptyBoardHint:
    "Upload audio from the dashboard, or forward an MP3 to the Telegram bot and pick this playlist.",
  playAria: (title: string) => `Play ${title}`,
  deleteAria: (title: string) => `Delete ${title}`,
  reorderAria: "Reorder track",
  viaTelegram: " · via Telegram",
  orderSaved: "Playlist order saved",
  reorderFailed: "Reorder failed",
  removed: (title: string) => `Removed "${title}"`,
  deleteFailed: "Delete failed",

  // ---- Player dock ----
  nothingPlaying: "Nothing playing",
  pickTrack: "Pick a track to fill the room",
  shuffle: "Shuffle",
  previous: "Previous track",
  next: "Next track",
  play: "Play",
  pause: "Pause",
  mute: "Mute",
  unmute: "Unmute",
  volume: "Volume",
  seek: "Seek",
  repeatLabel: (mode: string) =>
    `Repeat: ${mode === "ONE" ? "one" : mode === "ALL" ? "all" : "off"}`,
  playbackError: "Playback failed — the audio file may be missing on the server.",

  // ---- Auth ----
  loginTitle: "Staff sign in",
  loginSubtitle: "JWT session stored in an HttpOnly cookie — no external identity provider.",
  username: "Username",
  password: "Password",
  signIn: "Sign in",
  signingIn: "Signing in…",
  welcomeBack: (name: string) => `Welcome back, ${name}`,
  signedOut: "Signed out",
  logoutFailed: "Logout failed",
  loginFailed: "Login failed",

  // ---- Upload modal ----
  uploadTitle: "Add music to the cafe library",
  uploadSubtitle: "Files are stored on this server's local disk — nothing leaves the network.",
  destinationPlaylist: "Destination playlist",
  dropHere: "Drop audio files here",
  browseFiles: "or tap to browse",
  acceptedFormats: "MP3 · WAV · M4A · AAC · OGG · FLAC",
  title: "Track title",
  artist: "Artist",
  remove: "Remove",
  startUpload: "Upload",
  uploading: "Uploading…",
  uploadDone: "Done",
  uploadFailedShort: "Failed",
  close: "Done",
  added: (title: string) => `"${title}" added`,
  uploadFailed: "Upload failed",
  queueEmpty: "No files selected yet",

  // ---- Category manager ----
  categoryTitle: "Manage playlists",
  categorySubtitle:
    "Categories drive the tabs guests see. Deleting one removes its tracks and files.",
  newPlaylist: "New playlist",
  playlistName: "Name",
  description: "Description",
  color: "Accent",
  create: "Create playlist",
  save: "Save",
  edit: "Rename playlist",
  cancel: "Cancel",
  deletePlaylist: "Delete playlist",
  confirmDeletePlaylist: (name: string) =>
    `Delete "${name}" and every track inside it permanently?`,
  playlistCreated: "Playlist created",
  playlistUpdated: "Playlist renamed",
  playlistDeleted: "Playlist deleted",
  songsCount: (count: number) => `${count} tracks`,

  // ---- Admin panel ----
  adminTitle: "Admin control room",
  adminSubtitle: "Access control, system switches and the Telegram ingest bridge.",
  cafeName: "Cafe display name",
  allowGuestUpload: "Allow guest uploads",
  allowGuestUploadHint:
    "When on, signed-in GUEST accounts and non-whitelisted Telegram users can add tracks. Admins always can.",
  saveSettings: "Save settings",
  settingsSaved: "Cafe name updated",
  libraryStats: (songs: number, categories: number) =>
    `${songs} tracks across ${categories} playlists`,

  // ---- Admin: credentials ----
  credentials: "Admin account",
  currentPassword: "Current password",
  newPassword: "New password",
  confirmPassword: "Confirm new password",
  updateProfile: "Update account",
  profileUpdated: "Admin account updated — your session has been renewed",
  passwordsMismatch: "New password confirmation does not match",
  passwordTooShort: "New password must be at least 8 characters",

  // ---- Admin: telegram ----
  telegramSection: "Telegram sync bot",
  telegramConnect: "Connect Telegram bot",
  telegramConnecting: "Connecting…",
  telegramDisconnect: "Disconnect bot",
  telegramConnectedBanner: "Bot connected — you can now send music on Telegram.",
  telegramFailedBanner: "Could not connect — check the network connection.",
  telegramStandby: "Standby — the bot is not connected yet.",
  telegramActive: "Connected",
  telegramInactive: "Disconnected",
  telegramNotConfigured: "Bot token not configured",
  telegramHint:
    "This runs the bot on this server — no terminal command needed. The bot speaks Persian.",
  whitelist: "Whitelist",
  telegramId: "Telegram numeric ID",
  label: "Label",
  addToWhitelist: "Whitelist",
  whitelistEmpty: "No whitelisted IDs yet —",
  whitelistAdded: "Telegram ID whitelisted",
  whitelistRemoved: "Removed from whitelist",
  refresh: "Refresh bot status",

  // ---- Generic ----
  loading: "Loading…",
  errorGeneric: "Something went wrong",
  couldNotLoadPlaylists: "Could not load playlists",
  couldNotLoadTracks: "Could not load tracks",
  couldNotCheckUpdates: "Could not check for music updates",
  closeDialog: "Close dialog",
  sessionExpired: "Your session has expired. Please sign in again.",

  // ---- Scheduled playlists ----
  scheduleSection: "Scheduled playlists",
  scheduleHint:
    "At the set times, the chosen playlist starts right after the current song ends and then loops. Runs while this app is open.",
  scheduleTimezone: "Schedule timezone",
  scheduleTimezoneLocal: "Device local time",
  scheduleTime: "Time (HH:MM)",
  schedulePlaylist: "Playlist",
  scheduleLabel: "Label (optional)",
  scheduleAdd: "Add time",
  scheduleEmpty: "No scheduled times yet — add one below.",
  scheduleAdded: "Schedule added",
  scheduleUpdated: "Schedule updated",
  scheduleRemoved: "Schedule removed",
  scheduleToggleError: "Could not update schedule",
  scheduleFired: (label: string, time: string) =>
    `Schedule ${time} — switching to "${label}" after the current track`,
  scheduleEmptyPlaylist: (label: string) =>
    `Schedule "${label}" fired but its playlist has no tracks`,
} as const;

export type Dictionary = typeof en;
