[Setup]
AppName=Metal Gear: Allison's Collection
AppPublisher=Allie
AppVersion=1.0
AppVerName= Metal Gear: Allison's Collection v1.0
DefaultDirName={autopf}\Metal Gear - Allison's Collection
DefaultGroupName=Metal Gear: Allison's Collection
OutputBaseFilename=Metal_Gear_Allisons_Collection_Setup
SetupIconFile=E:\System\Downloads\Metal Gear Launcher\img\icon.ico

; Styling
WizardStyle=modern
WizardImageFile=E:\System\Downloads\Metal Gear Launcher\img\icon.bmp
WizardSmallImageFile=E:\System\Downloads\Metal Gear Launcher\img\MGS01.bmp
; Behavior
DiskSpanning=yes
SlicesPerDisk=1
Compression=lzma2/ultra64
SolidCompression=yes
InfoBeforeFile=E:\System\Downloads\Metal Gear Launcher\out\metal-gear-launcher-win32-x64\Message.txt
DisableReadyPage=yes

[Files]
; Source is the 'out' folder created by npm run package
Source: "E:\System\Downloads\Metal Gear Launcher\out\metal-gear-launcher-win32-x64\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs
Source: "E:\System\Downloads\Metal Gear Launcher\out\metal-gear-launcher-win32-x64\_Redist\VC_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{autodesktop}\Metal Gear: Allison's Collection"; Filename: "{app}\metal-gear-launcher.exe"
Name: "{group}\Metal Gear: Allison's Collection"; Filename: "{app}\metal-gear-launcher.exe"

[Run]
; Runs the dependency installer automatically
Filename: "{tmp}\VC_redist.x64.exe"; Parameters: "/passive /norestart"; StatusMsg: "Installing System Dependencies (Visual C++)..."
; Launches the app after finish
Filename: "{app}\metal-gear-launcher.exe"; Description: "Launch Metal Gear: Allison's Collection"; Flags: postinstall nowait

[Code]
// This part handles the Steam links and message at the end
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    MsgBox('You Did it Bestie!' #13#13 'Note: You still gotta buy Metal Gear Rising, MGSV, and Metal Gear Survive on Steam if you wanna play em', mbInformation, MB_OK);
  end;
end;