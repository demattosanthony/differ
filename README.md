<a id="readme-top"></a>

<h1 align="center"><code>differ</code></h1>
<p align="center"><em>Review and refine Git diffs before you push</em></p>

<p align="center">
  <img src= "https://github.com/user-attachments/assets/1fc3efcf-3b23-46c3-ab67-2ed88c740cd9" alt="differ_demo" />
</p>

## Install from release

```sh
curl -fsSL https://raw.githubusercontent.com/demattosanthony/differ/main/install.sh | bash
```

## Install from source

Requires [Bun](https://bun.sh/) and Git.

```sh
git clone https://github.com/demattosanthony/differ.git
cd differ
bun install
bun run build

rm -rf ~/.local/share/differ
mkdir -p ~/.local/share/differ ~/.local/bin
cp -R dist/. ~/.local/share/differ/
ln -sf ~/.local/share/differ/differ ~/.local/bin/differ
```

If `differ` is not found after install, add `~/.local/bin` to your `PATH`.

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
