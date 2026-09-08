mkdir -p app/src/utils
cat > app/src/utils/usageTracker.js << 'EOF'
const KEY = "scamshield_usage";
const FREE_LIMIT = 3;

export function getUsage() {
  const stored = JSON.parse(localStorage.getItem(KEY)) || { count: 0, premium: false };
  return stored;
}

export function canRunCheck() {
  const { count, premium } = getUsage();
  return premium || count < FREE_LIMIT;
}

export function recordCheck() {
  const stored = getUsage();
  if (!stored.premium) {
    stored.count += 1;
    localStorage.setItem(KEY, JSON.stringify(stored));
  }
  return stored;
}

export function remainingChecks() {
  const { count, premium } = getUsage();
  return premium ? Infinity : Math.max(0, FREE_LIMIT - count);
}
EOF
