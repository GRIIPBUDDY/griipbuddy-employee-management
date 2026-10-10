#!/bin/sh
# Read-only inventory. Stream over an existing SSH connection; do not copy to the VPS.
# No sudo, package changes, service changes, environment dumps, or full config/inspect dumps.
set -u
export LC_ALL=C

section() { printf '\n## %s\n' "$1"; }
run() {
  if "$@" 2>/dev/null; then :; else
    printf 'Unavailable or insufficient existing permission: %s\n' "$1"
  fi
}

section 'OS and architecture'
if [ -r /etc/os-release ]; then
  awk -F= '$1 == "NAME" || $1 == "VERSION_ID" || $1 == "PRETTY_NAME" {print}' /etc/os-release
fi
run uname -sm
run getconf _NPROCESSORS_ONLN
section 'Memory, swap, load, and filesystems'
run free -m
if [ -r /proc/loadavg ]; then cat /proc/loadavg; fi
run df -hP -x tmpfs -x devtmpfs
run df -iP -x tmpfs -x devtmpfs
section 'Listening TCP endpoints (no process arguments)'
run ss -lnt

section 'Docker versions and selected capacity fields'
if command -v docker >/dev/null 2>&1; then
  run docker version --format 'Client={{.Client.Version}} Server={{.Server.Version}}'
  run docker compose version --short
  run docker info --format 'Architecture={{.Architecture}} CPUs={{.NCPU}} MemoryBytes={{.MemTotal}} Root={{.DockerRootDir}}'
  section 'Running containers, images, published ports, and networks'
  run docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Networks}}'
  section 'Current container resource usage (one snapshot only)'
  run docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'
  section 'Docker networks and volumes (no config or labels)'
  run docker network ls --format 'table {{.Name}}\t{{.Driver}}\t{{.Scope}}'
  run docker volume ls --format 'table {{.Name}}\t{{.Driver}}'
else
  printf 'Docker command unavailable; nothing installed.\n'
fi

section 'Existing host proxy service activity'
if command -v systemctl >/dev/null 2>&1; then
  for service in nginx apache2 httpd caddy traefik haproxy; do
    printf '%s: ' "$service"
    systemctl is-active "$service" 2>/dev/null || :
  done
else
  printf 'systemctl unavailable; proxy identity requires owner confirmation.\n'
fi

section 'Safely identifiable Nginx domains (server_name directives only)'
# Print only DNS-shaped tokens from literal server_name directives. Never dump configs.
# Other proxies, templated names, includes, routing labels and TLS renewal require owner review.
domain_config_seen=false
for config in /etc/nginx/nginx.conf /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/*; do
  if [ -f "$config" ] && [ -r "$config" ]; then
    domain_config_seen=true
    awk '
      /^[[:space:]]*server_name[[:space:]]/ {
        sub(/#.*/, ""); gsub(/;/, " ");
        for (i=2; i<=NF; i++)
          if ($i ~ /^(\*\.)?[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z][A-Za-z]+$/) print $i;
      }' "$config"
  fi
done
if [ "$domain_config_seen" = false ]; then
  printf 'No readable standard Nginx files; domain inventory remains unverified.\n'
fi

section 'Firewall state readable with current privileges'
# Suppress error details, strip comments/quoted strings, and do not elevate permissions.
firewall_read=false
if command -v ufw >/dev/null 2>&1; then
  if firewall_output=$(ufw status 2>/dev/null); then
    printf '%s\n' "$firewall_output" | sed 's/#.*//'
    firewall_read=true
  fi
fi
if command -v firewall-cmd >/dev/null 2>&1; then
  if firewall_output=$(firewall-cmd --list-all 2>/dev/null); then
    printf '%s\n' "$firewall_output" | sed 's/#.*//'
    firewall_read=true
  fi
fi
if command -v nft >/dev/null 2>&1; then
  if firewall_output=$(nft list ruleset 2>/dev/null); then
    printf '%s\n' "$firewall_output" | sed 's/"[^"]*"/"<redacted>"/g; s/#.*//'
    firewall_read=true
  fi
fi
for firewall_command in iptables ip6tables; do
  if command -v "$firewall_command" >/dev/null 2>&1; then
    if firewall_output=$("$firewall_command" -S 2>/dev/null); then
      printf '%s\n' "$firewall_output" | sed 's/--comment "[^"]*"/--comment <redacted>/g; s/--comment [^ ]*/--comment <redacted>/g; s/"[^"]*"/"<redacted>"/g; s/#.*//'
      firewall_read=true
    fi
  fi
done
if [ "$firewall_read" = false ]; then
  printf 'Firewall rules unavailable with current privileges. Ask owner for a reviewed read-only inventory; no sudo attempted.\n'
fi
printf '\nInventory only. No server capacity, free port, ingress, TLS, or deployment approval is implied.\n'
