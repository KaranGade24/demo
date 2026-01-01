# Learn more about Nix-based IDX environments:
# https://developers.google.com/idx/guides/customize-idx-env

{ pkgs, ... }:

{
  # Which nixpkgs channel to use
  channel = "stable-24.05"; # or "unstable"

  # Packages available in the workspace
  packages = [
    pkgs.ffmpeg
    pkgs.docker
    pkgs.python311
    pkgs.python311Packages.pip
    pkgs.python311Packages.gunicorn
  ];

  # Enable Docker
  services.docker.enable = true;

  # Environment variables
  env = {};

  idx = {
    # VS Code extensions from Open VSX
    extensions = [
      "google.gemini-cli-vscode-ide-companion"
    ];

    # Enable previews (no command yet)
    previews = {
      enable = true;
    };

    # Workspace lifecycle hooks
    workspace = {
      onCreate = {
        default.openFiles = [
          ".idx/dev.nix"
          "README.md"
        ];
      };

      onStart = {
        # optional startup commands
      };
    };
  };
}
