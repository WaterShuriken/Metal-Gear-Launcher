!macro customUnInstall
  ; This prevents the uninstaller from removing these specific folders
  ; It effectively "orphans" them so they stay on the disk
  SetOutPath "$INSTDIR"
  
  ; This tells the uninstaller NOT to remove these directories
  RMDir /REBOOTOK "$INSTDIR\emulators"
  RMDir /REBOOTOK "$INSTDIR\roms"
  
  ; We use /REBOOTOK so it only deletes if they are empty
  ; Since they aren't empty, it will skip them
!macroend