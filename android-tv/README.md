# Syria Traders TV app (Android TV / Google TV)

An optional app that shows the game's TV screen on an Android TV or Google TV,
instead of a browser such as TV Bro. The PC still runs the game: rules, dice,
hands, saves and the online link stay on the PC. The app only opens the PC's TV
address (`http://<PC address>:8080/tv`) full screen.

What it adds over a browser:

- Full screen, with no address bar or browser menus, hardware-accelerated drawing.
- The screen stays awake during a match.
- Table sounds play straight away, without pressing a key on the remote first.
- **Back** opens a small menu (back to the game, reload, change PC address,
  close the app) instead of leaving the game.
- If the PC isn't answering (game not started, TV on another Wi-Fi), it says so
  and tries again every 5 seconds, so it picks the game up as soon as
  `run-game.bat` is running.

TV Bro, `run-game.bat` and `run-game-online.bat` keep working exactly as before.

## Get the APK

GitHub builds it on every change to this folder: open the latest
**Android TV app** run under the repository's **Actions** tab and download
`syria-traders-tv-apk` (a zip with `syria-traders-tv.apk` inside).

To build it yourself: JDK 17, Gradle 8.9 or newer and the Android SDK
(`ANDROID_HOME`), then `gradle -p android-tv assembleRelease`. The APK is at
`android-tv/app/build/outputs/apk/release/app-release.apk`.

## Install it on the TV

The easiest way is to let the TV download it from the PC it plays on:

1. Put `syria-traders-tv.apk` in this `android-tv` folder on the PC (for example
   `F:\syria-traders-tv\android-tv\syria-traders-tv.apk`) and start
   `run-game.bat`.
2. On the TV, open TV Bro (or the free **Downloader** app) and go to
   `http://<PC address>:8080/tv-app.apk`, for example
   `http://192.168.1.164:8080/tv-app.apk`.
3. Open the downloaded file. The first time, the TV asks to allow installing
   apps from that app: choose **Settings**, turn it on for TV Bro (or
   Downloader), go back and press **Install**.
4. Open **Syria Traders** from the TV's apps row. Enter the PC address
   (`192.168.1.164:8080` is filled in) and press **Show the game**. It remembers it.

A USB stick works too: copy the APK onto it, plug it into the TV and open it
with a file manager app from the Play Store.

The online link from `run-game-online.bat` also works: press Back, choose
**Change PC address** and type the full `https://` link.

**Updating:** each build is signed with a throwaway key, so to install a newer
APK, uninstall the old app first (Settings, Apps, Syria Traders, Uninstall).
The app keeps nothing but the PC address, so nothing is lost.
