<a id="readme-top"></a>

<h1 align="center"><code>differ</code></h1>
<p align="center"><em>Review and refine Git diffs before you push</em></p>

<p align="center">
  <img src= "https://github.com/user-attachments/assets/1fc3efcf-3b23-46c3-ab67-2ed88c740cd9" alt="differ_demo" />
</p>

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
