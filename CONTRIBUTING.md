# Contributing to OpenChat

This guide covers building the app from source and the day-to-day dev loop. OpenChat is an Expo app written in TypeScript. Android is the main target.

## Prerequisites

| Tool        | Notes                                                                       |
| ----------- | --------------------------------------------------------------------------- |
| Node.js 24+ |                                                                             |
| pnpm        | The repo's package manager.                                                 |
| JDK 17+     | For Android builds. CI uses Temurin 21.                                     |
| Android SDK | With build-tools and at least one platform. Set `ANDROID_HOME` to its path. |

Install dependencies:

```sh
pnpm install
```

## Run a server for testing

The app talks to an [OpenCode](https://opencode.ai) V2 server over HTTP and SSE. You need one running before the app can do anything useful.

The Docker image in [docker/opencode](docker/opencode/README.md) is the closest match to what users run. To build it from your checkout instead of pulling it, uncomment the `build` block in `docker-compose.yml`.

To run OpenCode directly, start it from a dedicated directory so test chats don't mix with your other sessions:

```sh
mkdir -p ~/opencode-chat && cd ~/opencode-chat
opencode serve --port 4096
```

Plain `opencode serve` gives the model its full coding toolset. If you want the locked-down chat agent the Docker image uses, copy [docker/opencode/opencode.json](docker/opencode/opencode.json) into that directory.

How the app reaches the server depends on where the app runs:

- Android emulator. Use `http://10.0.2.2:4096`, the emulator's alias for your host.
- Physical device over USB. Run `adb reverse tcp:4096 tcp:4096`, then use `http://localhost:4096`.

## Run on the Android emulator

1. Boot an emulator. Create one in Android Studio or with `avdmanager` if you don't have one.

   ```sh
   emulator -avd <avd-name>
   ```

2. Build, install and launch the debug app. This also starts Metro.

   ```sh
   pnpm android
   ```

   The first build sets up Gradle and compiles native code, so expect several minutes. Later builds are incremental.

3. In later sessions you only need the emulator and Metro:

   ```sh
   pnpm start   # press "a" to open the app on the emulator
   ```

JavaScript changes hot-reload. Changes to native code or to native config in `app.json` need another `pnpm android`.

### More than one device attached

If an emulator and a phone are both connected, pin the target. Otherwise the build tooling picks one for you. Pass the device name as the interactive picker shows it (the AVD name for emulators, not the adb serial):

```sh
pnpm android --device <avd-name>
```

Or export `ANDROID_SERIAL` with the id from `adb devices`, and every adb and Gradle command in that shell targets that device.

## Run on a physical Android device

1. Turn on Developer options and USB debugging on the device, then connect it.
2. Check that `adb devices` lists it as `device`. If it says `unauthorized`, accept the prompt on the phone.
3. Run `pnpm android --device` and pick it from the list.

## Native folders

Expo prebuild generates `android/` from `app.json` and the config plugins in `plugins/`. Git ignores the folder, so don't edit it by hand. To regenerate it:

```sh
pnpm exec expo prebuild --platform android
```

If a native build starts misbehaving, delete `android/` and regenerate. Keeping native config in `app.json` is deliberate. If a change ever needs hand-edited native files, raise it first.

## Scripts

| Command                             | Purpose                                               |
| ----------------------------------- | ----------------------------------------------------- |
| `pnpm start`                        | Metro dev server.                                     |
| `pnpm android`                      | Build, install and launch on Android (dev client).    |
| `pnpm ios`                          | Same for iOS. Needs macOS and Xcode.                  |
| `pnpm web`                          | Run in the browser. Handy for quick layout checks.    |
| `pnpm typecheck`                    | TypeScript, no emit.                                  |
| `pnpm lint`                         | ESLint with the Expo config.                          |
| `pnpm test`                         | Jest unit tests.                                      |
| `pnpm format` / `pnpm format:check` | Prettier.                                             |
| `pnpm icons`                        | Re-render the app icon PNGs from `assets/icon/*.svg`. |

Run `pnpm typecheck`, `pnpm lint` and `pnpm test` before opening a pull request. The release workflow runs the same three and fails on any of them.
