#!/usr/bin/env bash
set -euo pipefail

: "${ADMIN_CIDR:?Defina ADMIN_CIDR, por exemplo 203.0.113.10/32}"

RESOURCE_GROUP=${AZURE_RESOURCE_GROUP:-plataforma-cursos-prod-rg}
LOCATION=${AZURE_LOCATION:-brazilsouth}
VM_NAME=${AZURE_VM_NAME:-plataforma-cursos-prod}
VM_SIZE=${AZURE_VM_SIZE:-Standard_B2als_v2}
ADMIN_USER=${AZURE_ADMIN_USER:-azureuser}
SSH_PUBLIC_KEY=${AZURE_SSH_PUBLIC_KEY:-$PWD/.azure-production/id_ed25519.pub}
VNET_NAME=${AZURE_VNET_NAME:-${VM_NAME}-vnet}
SUBNET_NAME=${AZURE_SUBNET_NAME:-${VM_NAME}-subnet}
NSG_NAME=${AZURE_NSG_NAME:-${VM_NAME}-nsg}
IP_NAME=${AZURE_IP_NAME:-${VM_NAME}-ip}
NIC_NAME=${AZURE_NIC_NAME:-${VM_NAME}-nic}

[[ "$RESOURCE_GROUP" != *demo* && "$RESOURCE_GROUP" != *staging* && "$VM_NAME" != *demo* && "$VM_NAME" != *staging* ]] || { echo 'Destino de produção inválido.' >&2; exit 1; }
[[ "$ADMIN_CIDR" == */32 || "$ADMIN_CIDR" == */128 ]] || { echo 'SSH exige IP administrativo individual.' >&2; exit 1; }
command -v az >/dev/null || { echo 'Azure CLI não encontrada.' >&2; exit 1; }
az account show --output none
test -r "$SSH_PUBLIC_KEY" || { echo "Chave pública ausente: $SSH_PUBLIC_KEY" >&2; exit 1; }

if [ "$(az group exists --name "$RESOURCE_GROUP")" != true ]; then
    az group create --name "$RESOURCE_GROUP" --location "$LOCATION" \
        --tags environment=production workload=plataforma-cursos --output none
fi

az network vnet show -g "$RESOURCE_GROUP" -n "$VNET_NAME" --output none 2>/dev/null || \
    az network vnet create -g "$RESOURCE_GROUP" -n "$VNET_NAME" \
        --location "$LOCATION" \
        --address-prefixes 10.43.0.0/16 --subnet-name "$SUBNET_NAME" \
        --subnet-prefixes 10.43.0.0/24 --output none

az network public-ip show -g "$RESOURCE_GROUP" -n "$IP_NAME" --output none 2>/dev/null || \
    az network public-ip create -g "$RESOURCE_GROUP" -n "$IP_NAME" \
        --location "$LOCATION" --sku Standard --allocation-method Static --output none

az network nsg show -g "$RESOURCE_GROUP" -n "$NSG_NAME" --output none 2>/dev/null || \
    az network nsg create -g "$RESOURCE_GROUP" -n "$NSG_NAME" --location "$LOCATION" --output none

for spec in "ssh-admin:100:22:$ADMIN_CIDR" "http:110:80:Internet" "https:120:443:Internet"; do
    IFS=: read -r rule priority port source <<<"$spec"
    az network nsg rule show -g "$RESOURCE_GROUP" --nsg-name "$NSG_NAME" -n "$rule" --output none 2>/dev/null || \
        az network nsg rule create -g "$RESOURCE_GROUP" --nsg-name "$NSG_NAME" -n "$rule" \
            --priority "$priority" --access Allow --protocol Tcp --direction Inbound \
            --source-address-prefixes "$source" --source-port-ranges '*' \
            --destination-address-prefixes '*' --destination-port-ranges "$port" --output none
done

az network nic show -g "$RESOURCE_GROUP" -n "$NIC_NAME" --output none 2>/dev/null || \
    az network nic create -g "$RESOURCE_GROUP" -n "$NIC_NAME" \
        --location "$LOCATION" \
        --vnet-name "$VNET_NAME" --subnet "$SUBNET_NAME" \
        --network-security-group "$NSG_NAME" --public-ip-address "$IP_NAME" --output none

az vm show -g "$RESOURCE_GROUP" -n "$VM_NAME" --output none 2>/dev/null || \
    az vm create -g "$RESOURCE_GROUP" -n "$VM_NAME" --nics "$NIC_NAME" \
        --location "$LOCATION" \
        --image Canonical:ubuntu-24_04-lts:server:latest --size "$VM_SIZE" \
        --admin-username "$ADMIN_USER" --ssh-key-values "$SSH_PUBLIC_KEY" \
        --authentication-type ssh --os-disk-size-gb 32 --storage-sku StandardSSD_LRS \
        --tags environment=production workload=plataforma-cursos --output none

PUBLIC_IP=$(az network public-ip show -g "$RESOURCE_GROUP" -n "$IP_NAME" --query ipAddress -o tsv)
printf 'RESOURCE_GROUP=%s\nVM_NAME=%s\nVM_SIZE=%s\nPUBLIC_IP=%s\nSSH=%s@%s\n' \
    "$RESOURCE_GROUP" "$VM_NAME" "$VM_SIZE" "$PUBLIC_IP" "$ADMIN_USER" "$PUBLIC_IP"
