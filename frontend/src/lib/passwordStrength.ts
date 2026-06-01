export interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

export function getPasswordStrength(pw: string): PasswordStrength {
  if (pw.length === 0) return { score: 0, label: "", color: "" };
  if (pw.length < 8) return { score: 1, label: "Zu kurz", color: "#ef4444" };
  let score = 1;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score === 1) return { score: 1, label: "Schwach", color: "#ef4444" };
  if (score === 2) return { score: 2, label: "Mittel", color: "#f59e0b" };
  if (score === 3) return { score: 3, label: "Gut", color: "#00D4FF" };
  return { score: 4, label: "Stark", color: "#00FF88" };
}
