# The FabMo Engine
The FabMo engine is host software that connects to a G2 motion control platform and manages it, exposing a web interface.  The engine serves the following major functions:


* Streaming of G-Code files to G2
* Monitoring of G2 motion state and cycle progress
* Storage and management of files (that currently cannot be stored on G2)
* Interpretation of the OpenSBP (ShopBot) language
* Hosting of the "FabMo Dashboard" a web frontend to the FabMo Engine that provides an app hosting environment

## Documentation
[Source Code Documentation](http://fabmo.github.io/FabMo-Engine/)

[API Documentation](http://fabmo.github.io/FabMo-Engine/api)

## Quick Start

**This needs updated for OS X** - the port is wrong and the data directory is now different.

1. Install nodejs - The officially supported version is v0.12.7  - Newer versions *do not work at this time*
1. Check out the source code https://github.com/ShopBotTools/FabMo-Engine.git
1. From inside the source directory, install all of the engine dependencies with `npm install`
1. Create the engine data directory at `/opt/fabmo` or `C:\opt\fabmo` if you're on windows.  Set the permissions on this directory so that the user running the engine can read/write to it.
1. Start the engine with `npm run debug` for development mode or `npm start` for production mode.
1. On Windows it is unlikely that the default COM port settings are satisfactory.  After running the engine once, edit `C:\fabmo\config\engine.json` and set the two COM ports for your platform with the appropriate values for your system.

** Note that you should not need to run the engine as a privileged user.  If you have to run your engine using `sudo` check your node installation and the permissions settings for the /opt/fabmo directory **

When the engine starts, it will connect to G2 and setup an http server to accept connections on port 80.  Once the engine is running you can visit [http://localhost/](http://localhost/) to use the fabmo dashboard.

## Installing the Engine
The engine is run from source, and only needs to be checked out and stored in a local directory.  Run `npm install` from the source directory to install the needed dependencies.

### On the Intel Edison

![Intel Edison](/doc/intel_edison.jpg)

To install the engine in the "standard" location on the Intel Edison, perform the following steps.

1. Checkout the source into `/fabmo` with `git clone https://github.com/FabMo/FabMo-Engine /fabmo`
2. Install dependencies using npm: `cd /fabmo; npm install`
3. Install the systemd service file `cp /fabmo/files/fabmo.service /etc/systemd/system`
4. Set the appropriate permissions on the service file `chmod 0775 /etc/systemd/system/fabmo.service`
5. Inform systemd of the unit file change `systemctl daemon-reload`
6. Enable the new service `systemctl enable fabmo`
7. Start the new service immediately `systemctl start fabmo`
8. After the engine has had time to start, check its status: `systemctl status fabmo`

### On the Raspberry Pi 3

![Raspberry Pi](/doc/raspi.png)

To install the engine in the "standard" location on the Raspberry Pi 3, perform the following steps.

1. Checkout the source into `/fabmo` with `git clone https://github.com/FabMo/FabMo-Engine /fabmo`
2. Checkout the appropriate branch of the source tree.  The `release` branch is the most recent stable release.  (`git checkout release`)
3. Install dependencies using npm: `cd /fabmo; npm install`
4. Run the engine using the instructions below

### On Mac OS X

![Apple Logo](/doc/apple_logo.gif)

To install the engine in the standard location on a Mac, follow the steps below.  This method is used by the FabMo team for development in the OSX environment.

Note that on OS X it's recommended that you run FabMo as a non-`root` user. The configuration will be stored at `~Library/Application\ Support/FabMo/` where `~` refers to the home directory of that user.

1. Install XCode command line tools. You can do this with `xcode-select --install`
  - It will report if they are already installed.
1. Install Node.js - You'll need an older version: `0.12.*` to be compatible with FabMo.
  - You can use [the node utility n](https://github.com/tj/n) to install an older version. Follow the [instructions to `n`](https://github.com/tj/n#installation) first.
  - If you need your system-wide default node to be LTS or such, you can install `v0.12.18` like so (once `n` is installed):
    ```bash
    sudo n v0.12.18
    ```
  - Now that node v0.12.18 is installed, in the terminal where you want to run FabMo (*each time*):
    ```bash
    # may need adjusted for non-bash:
    export PATH=`dirname $(n which v0.12.18)`:$PATH

    # Then this:
    node -v
    # should report as v0.12.18
    ```
2. `npm` should be installed along with node, and the change of `PATH` will also switch which `npm` is used. You must *not* update the `npm` that is installed with the older node.
3. Create the fabmo directory, for example: `mkdir -p ~/fabmo`
  - You can place it almost anywhere in your home directory, however there should be no spaces or special characters (letters, numbers, `-`, and `_` are all safe) in the path.
  - Remember to adjust the following instructions to match the new location.
2. Clone the engine source `~/fabmo/engine` with `git clone https://github.com/FabMo/FabMo-Engine ~/fabmo/engine`
2. Checkout the appropriate branch of the source tree.  The `release` branch is the most recent stable release.  (`git checkout release` from the `~/fabmo/engine` directory)
3. Install dependencies using npm: `cd ~/fabmo/engine; npm install`
4. Run the engine using the instructions below.  Make sure that the G2 motion control board is connected the first time you run the engine.  The engine auto-detects the USB port and saves this setting on first run, and if the motion controller is absent, it won't be properly detected.  If you need to change ports later on, the port settings are located in `~Library/Application\ Support/FabMo/config/engine.json`

## Running the Engine
For debugging the engine, you can run it directly from the command prompt with `npm start` or `node server.js`  Running with `npm run debug` puts the engine in debug mode, in which it does more agressive app reloading.  (This is recommended for app development, particularly for system apps)  `npm debug slow` introduces deliberate network latency on GET/POST requests, for testing.  This latency can be adjusted in `engine.js`

## Development Automation
A number of grunt tasks have been set up to facilitate engine development.  To see them, run `grunt` with no arguments in the source directory, and a list will be produced with explanations.
