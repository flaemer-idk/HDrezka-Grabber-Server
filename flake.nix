{
  description = "HDrezka Grabber — расширение и локальный сервер загрузок с веб-мордой";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
    in
    {
      packages = forAllSystems (pkgs: rec {
        hdrezka-grabber-server = pkgs.callPackage ./nix/package.nix { };
        default = hdrezka-grabber-server;
      });

      # Проверка сборки пакета: nix flake check
      checks = forAllSystems (pkgs: {
        hdrezka-grabber-server = self.packages.${pkgs.system}.hdrezka-grabber-server;
      });

      nixosModules.default = import ./nix/module.nix;
      nixosModules.hdrezka-grabber-server = self.nixosModules.default;

      overlays.default = final: prev: {
        hdrezka-grabber-server = final.callPackage ./nix/package.nix { };
      };
    };
}