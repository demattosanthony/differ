# differ

Local git diff viewer that launches a browser UI.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/demattosanthony/differ/main/install.sh | bash
```

## Usage

```sh
differ
```

Options:

- `--path <dir>`: repo path (defaults to current directory)
- `--port <port>`: server port (defaults to 4141)
- `--compare <working|range|pr>`: compare working tree (default) or branch range
- `--base <ref>`: base ref for range compare (defaults to origin/HEAD)
- `--head <ref>`: head ref for range compare (defaults to HEAD)

## PWA install

Open the printed URL in Chrome and choose "Install Differ" from the address bar or menu. For a stable origin, keep the port fixed (e.g. `--port 4141`). The install banner shows by default until dismissed. When installed, running `differ` will prefer opening the PWA app on macOS if the port matches.
