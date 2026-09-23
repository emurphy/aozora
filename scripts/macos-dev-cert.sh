#!/bin/bash
# Creates a self-signed code-signing certificate for local macOS builds.
#
# A local build is ad-hoc signed by default, and its signature changes every
# time, so macOS treats each build as a different app and asks again for the
# "Aozora Safe Storage" keychain item (Electron's cookie-encryption key). Signing
# with a stable identity keeps that grant.
#
#   ./scripts/macos-dev-cert.sh
#   AOZORA_SIGN_IDENTITY="Aozora Local Dev" yarn package --platform=darwin --arch=arm64
#
# The certificate is self-signed and trusted only in your login keychain: enough
# to run builds on this Mac, not to distribute them. An existing identity works
# too, e.g. an Apple Development one (`security find-identity -v -p codesigning`).
set -euo pipefail

NAME="${1:-Aozora Local Dev}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then
  echo "Signing identity \"$NAME\" already exists."
  exit 0
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

openssl req -x509 -newkey rsa:2048 -keyout "$WORK/key.pem" -out "$WORK/cert.pem" -days 3650 -nodes \
  -subj "/CN=$NAME" \
  -addext "extendedKeyUsage=critical,codeSigning" \
  -addext "basicConstraints=critical,CA:false" \
  -addext "keyUsage=critical,digitalSignature" 2>/dev/null

# Legacy PKCS#12 algorithms: macOS can't read OpenSSL 3's defaults.
openssl pkcs12 -export -out "$WORK/bundle.p12" -inkey "$WORK/key.pem" -in "$WORK/cert.pem" -name "$NAME" \
  -passout pass:aozora -macalg sha1 -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES

security import "$WORK/bundle.p12" -k "$KEYCHAIN" -P aozora -A -T /usr/bin/codesign
# Self-signed: the certificate is its own root, so it has to be trusted to sign with.
security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$WORK/cert.pem"

echo
echo "Created signing identity \"$NAME\". Build with:"
echo "  AOZORA_SIGN_IDENTITY=\"$NAME\" yarn package --platform=darwin --arch=arm64"
