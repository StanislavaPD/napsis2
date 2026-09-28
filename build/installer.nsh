; Custom NSIS script for Напояване ХТР Ямбол installer
; Provides professional, modern UI for the installation wizard

; Modern UI 2 Configuration
!include "MUI2.nsh"

; ============================================================================
; Modern UI Settings
; ============================================================================

; Use Modern UI
!define MUI_ICON "${BUILD_RESOURCES_DIR}\build-icon.ico"
!define MUI_UNICON "${BUILD_RESOURCES_DIR}\build-icon.ico"

; Header and sidebar graphics (if available)
!ifdef INSTALLER_HEADER_BMP
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_BITMAP "${BUILD_RESOURCES_DIR}\installer-header.bmp"
  !define MUI_HEADERIMAGE_RIGHT
!endif

!ifdef INSTALLER_SIDEBAR_BMP
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\installer-sidebar.bmp"
  !define MUI_UNWELCOMEFINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\installer-sidebar.bmp"
!endif

; Welcome page customization
!define MUI_WELCOMEPAGE_TITLE "Добре дошли в инсталатора на Напояване ХТР Ямбол"
!define MUI_WELCOMEPAGE_TEXT "Тази програма ще инсталира Напояване ХТР Ямбол на вашия компютър.$\r$\n$\r$\nСистемата осигурява управление на договори, актове, заявки и плащания за напояване.$\r$\n$\r$\nПрепоръчително е да затворите всички други приложения преди да продължите с инсталацията.$\r$\n$\r$\nНатиснете Напред за да продължите."

; License page
!define MUI_LICENSEPAGE_TEXT_TOP "Моля, прочетете лицензионното споразумение преди да продължите."
!define MUI_LICENSEPAGE_TEXT_BOTTOM "Ако приемате условията на споразумението, изберете 'Приемам' за да продължите. Трябва да приемете споразумението за да инсталирате Напояване ХТР Ямбол."
!define MUI_LICENSEPAGE_BUTTON "Приемам"

; Directory page
!define MUI_DIRECTORYPAGE_TEXT_TOP "Инсталаторът ще инсталира Напояване ХТР Ямбол в следната папка.$\r$\n$\r$\nЗа инсталация в друга папка, натиснете Преглед и изберете друга папка."
!define MUI_DIRECTORYPAGE_TEXT_DESTINATION "Папка за инсталация"

; Installation page
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Инсталацията е завършена"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "Напояване ХТР Ямбол беше инсталирана успешно."
!define MUI_INSTFILESPAGE_ABORTHEADER_TEXT "Инсталацията е прекъсната"
!define MUI_INSTFILESPAGE_ABORTHEADER_SUBTEXT "Инсталацията не беше завършена успешно."

; Finish page customization
!define MUI_FINISHPAGE_TITLE "Инсталацията на Напояване ХТР Ямбол завърши успешно"
!define MUI_FINISHPAGE_TEXT "Напояване ХТР Ямбол беше инсталирана на вашия компютър.$\r$\n$\r$\nНатиснете Завършване за да затворите инсталатора."
!define MUI_FINISHPAGE_RUN "$INSTDIR\NapoyavaneHTR.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Стартирай Напояване ХТР Ямбол"
!define MUI_FINISHPAGE_LINK "Посетете уебсайта на ХТР Ямбол"
!define MUI_FINISHPAGE_LINK_LOCATION "https://htr-yambol.com"

; Uninstaller pages
!define MUI_UNCONFIRMPAGE_TEXT_TOP "Напояване ХТР Ямбол ще бъде деинсталирана от следната папка. Натиснете Деинсталирай за да продължите."

; ============================================================================
; Visual Style
; ============================================================================

; Colors (professional blue-green theme matching the app)
!define MUI_BGCOLOR "FFFFFF"
!define MUI_TEXTCOLOR "1F2937"

; UI customization
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Сигурни ли сте, че искате да прекъснете инсталацията на Напояване ХТР Ямбол?"
!define MUI_ABORTWARNING_CANCEL_DEFAULT

; Uninstaller warning
!define MUI_UNABORTWARNING
!define MUI_UNABORTWARNING_TEXT "Сигурни ли сте, че искате да прекъснете деинсталацията на Напояване ХТР Ямбол?"

; ============================================================================
; Branding
; ============================================================================

BrandingText "Напояване ХТР Ямбол - Система за управление на напояване"

; ============================================================================
; Custom Messages
; ============================================================================

; Bulgarian language strings
LangString DESC_SecMain ${LANG_BULGARIAN} "Основни файлове на приложението"
LangString DESC_SecDesktop ${LANG_BULGARIAN} "Създаване на икона на работния плот"
LangString DESC_SecStartMenu ${LANG_BULGARIAN} "Създаване на икона в Start Menu"

; Installation messages
LangString MSG_RUNNING ${LANG_BULGARIAN} "Друга копие на Напояване ХТР Ямбол е стартирано. Моля, затворете го и опитайте отново."
LangString MSG_POSTGRESQL ${LANG_BULGARIAN} "PostgreSQL база данни ще бъде конфигурирана автоматично при първо стартиране."

; ============================================================================
; Additional Installation Steps
; ============================================================================

; Custom page for PostgreSQL info (optional)
Function ShowPostgreSQLInfo
  MessageBox MB_OK|MB_ICONINFORMATION "$(MSG_POSTGRESQL)"
FunctionEnd

; Check if application is running
Function .onInit
  System::Call 'kernel32::CreateMutex(i 0, i 0, t "NapoyavaneHTRYambol") i .r1 ?e'
  Pop $R0
  StrCmp $R0 0 +3
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(MSG_RUNNING)"
    Abort
FunctionEnd

; ============================================================================
; Modern UI Completion
; ============================================================================

; Add version info to installer
VIProductVersion "${VERSION}"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "ProductName" "Напояване ХТР Ямбол"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "CompanyName" "ХТР Ямбол"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "LegalCopyright" "© 2026 ХТР Ямбол"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "FileDescription" "Система за управление на договори и напояване"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=${LANG_BULGARIAN} "ProductVersion" "${VERSION}"

; Progress bar customization
XPStyle on
