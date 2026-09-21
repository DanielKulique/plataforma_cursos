#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
    echo 'Execute como usuário administrativo não-root; o script usará sudo.' >&2
    exit 1
fi

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
. /etc/os-release
ARCH=$(dpkg --print-architecture)
echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" | \
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates curl git docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin
if ! command -v az >/dev/null; then
    curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
fi
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
sudo install -d -m 0750 -o "$USER" -g "$USER" /opt/plataforma-cursos

docker --version
docker compose version
az version --query '"azure-cli"' -o tsv
echo 'Docker instalado. Encerre a sessão SSH e conecte novamente para aplicar o grupo docker.'
