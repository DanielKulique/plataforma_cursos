#!/usr/bin/env bash
set -Eeuo pipefail

RESOURCE_GROUP=${AZURE_RESOURCE_GROUP:-plataforma-cursos-demo-rg}
LOCATION=${AZURE_BACKUP_LOCATION:-chilecentral}
VM_NAME=${AZURE_VM_NAME:-plataforma-cursos-demo}
ENVIRONMENT=${AZURE_ENVIRONMENT:-staging}
[[ "$ENVIRONMENT" == staging || "$ENVIRONMENT" == production ]] || { echo 'Ambiente inválido.' >&2; exit 1; }
if [[ "$ENVIRONMENT" == production ]]; then
    [[ "$RESOURCE_GROUP" != *demo* && "$RESOURCE_GROUP" != *staging* && "$VM_NAME" != *demo* && "$VM_NAME" != *staging* ]] || { echo 'Produção não pode utilizar recursos de staging.' >&2; exit 1; }
fi
: "${AZURE_STORAGE_ACCOUNT:?Defina um nome globalmente único (3-24 caracteres minúsculos/números)}"
AZURE_STORAGE_CONTAINER=${AZURE_STORAGE_CONTAINER:-plataforma-backups}
[[ "$AZURE_STORAGE_ACCOUNT" =~ ^[a-z0-9]{3,24}$ ]] || { echo 'Storage account inválido.' >&2; exit 1; }
[[ "$AZURE_STORAGE_CONTAINER" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || { echo 'Container inválido.' >&2; exit 1; }
command -v az >/dev/null || { echo 'Azure CLI ausente.' >&2; exit 1; }
az account show --output none

if ! az storage account show -g "$RESOURCE_GROUP" -n "$AZURE_STORAGE_ACCOUNT" --output none 2>/dev/null; then
    az storage account create -g "$RESOURCE_GROUP" -n "$AZURE_STORAGE_ACCOUNT" -l "$LOCATION" \
        --sku Standard_LRS --kind StorageV2 --https-only true --min-tls-version TLS1_2 \
        --allow-blob-public-access false --public-network-access Enabled \
        --tags environment="$ENVIRONMENT" workload=plataforma-cursos purpose=backup-offsite --output none
fi
az storage account update -g "$RESOURCE_GROUP" -n "$AZURE_STORAGE_ACCOUNT" \
    --https-only true --min-tls-version TLS1_2 --allow-blob-public-access false --output none
az storage container-rm show -g "$RESOURCE_GROUP" --storage-account "$AZURE_STORAGE_ACCOUNT" -n "$AZURE_STORAGE_CONTAINER" --output none 2>/dev/null || \
    az storage container-rm create -g "$RESOURCE_GROUP" --storage-account "$AZURE_STORAGE_ACCOUNT" \
        -n "$AZURE_STORAGE_CONTAINER" --public-access off --output none

az vm identity assign -g "$RESOURCE_GROUP" -n "$VM_NAME" --output none
principal_id=$(az vm identity show -g "$RESOURCE_GROUP" -n "$VM_NAME" --query principalId -o tsv)
[[ -n "$principal_id" ]] || { echo 'Identidade gerenciada da VM indisponível.' >&2; exit 1; }
account_id=$(az storage account show -g "$RESOURCE_GROUP" -n "$AZURE_STORAGE_ACCOUNT" --query id -o tsv)
scope="$account_id/blobServices/default/containers/$AZURE_STORAGE_CONTAINER"
if ! az role assignment list --assignee "$principal_id" --scope "$scope" --role 'Storage Blob Data Contributor' --query '[0].id' -o tsv | grep -q .; then
    az role assignment create --assignee-object-id "$principal_id" --assignee-principal-type ServicePrincipal \
        --role 'Storage Blob Data Contributor' --scope "$scope" --output none
fi

printf 'OFFSITE_AZURE_READY account=%s container=%s location=%s vm_identity=%s scope=%s\n' \
    "$AZURE_STORAGE_ACCOUNT" "$AZURE_STORAGE_CONTAINER" "$LOCATION" "$principal_id" "$scope"
