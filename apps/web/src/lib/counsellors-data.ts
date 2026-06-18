export type CounsellorStatus = "Active" | "Inactive" | "On Leave";

export interface Counsellor {
  empId: string;
  name: string;
  email: string;
  phone: string;
  team: string;
  teamLeader: string;
  group: string;
  manager: string;
  activeTarget: number;
  achieved: number;
  status: CounsellorStatus;
  joiningDate: string; // YYYY-MM-DD
  designation: string;
  gender: "Male" | "Female" | "Other";
  dob: string;
}

export const TEAMS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];
export const GROUPS = ["North", "South", "East", "West", "Central"];
export const TEAM_LEADERS = [
  "Priya Sharma",
  "Rohit Verma",
  "Anjali Mehta",
  "Vikram Singh",
  "Neha Kapoor",
];
export const MANAGERS = ["Arjun Rao", "Sneha Iyer", "Karan Malhotra", "Divya Nair"];
export const DESIGNATIONS = [
  "Junior Counsellor",
  "Counsellor",
  "Senior Counsellor",
  "Lead Counsellor",
];

const FIRST = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Reyansh", "Krishna",
  "Ishaan", "Shaurya", "Ananya", "Aadhya", "Diya", "Saanvi", "Myra", "Anika",
  "Riya", "Pari", "Aarohi", "Navya", "Kabir", "Dev", "Yash", "Rohan",
];
const LAST = [
  "Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Singh", "Khan",
  "Mehta", "Joshi", "Kapoor", "Chopra", "Bose", "Das", "Mishra", "Pillai",
];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function pad(n: number, w = 4) {
  return String(n).padStart(w, "0");
}

export const ALL_COUNSELLORS: Counsellor[] = Array.from({ length: 64 }).map((_, i) => {
  const first = pick(FIRST, i * 3 + 1);
  const last = pick(LAST, i * 5 + 2);
  const name = `${first} ${last}`;
  const team = pick(TEAMS, i);
  const group = pick(GROUPS, i + 2);
  const tl = pick(TEAM_LEADERS, i + 1);
  const mgr = pick(MANAGERS, i + 3);
  const designation = pick(DESIGNATIONS, i + 1);
  const statusPool: CounsellorStatus[] = [
    "Active", "Active", "Active", "Active", "Active",
    "Inactive", "On Leave",
  ];
  const status = pick(statusPool, i * 2 + 1);
  const target = 20 + (i % 7) * 5;
  const achieved = Math.max(0, target - ((i * 3) % 18));
  const year = 2020 + (i % 5);
  const month = pad((i % 12) + 1, 2);
  const day = pad((i % 27) + 1, 2);
  const dobYear = 1985 + (i % 15);
  return {
    empId: `UC-${pad(1001 + i)}`,
    name,
    email: `${first.toLowerCase()}.${last.toLowerCase()}@upcarrera.com`,
    phone: `+91 9${pad(100000000 + i * 7919, 9)}`.slice(0, 14),
    team,
    teamLeader: tl,
    group,
    manager: mgr,
    activeTarget: target,
    achieved,
    status,
    joiningDate: `${year}-${month}-${day}`,
    designation,
    gender: i % 3 === 0 ? "Female" : i % 5 === 0 ? "Other" : "Male",
    dob: `${dobYear}-${month}-${day}`,
  };
});

export function getCounsellorByEmpId(empId: string): Counsellor | undefined {
  return ALL_COUNSELLORS.find((c) => c.empId.toLowerCase() === empId.toLowerCase());
}

export const STATUS_STYLES: Record<CounsellorStatus, string> = {
  Active: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  Inactive: "bg-rose-500/10 text-rose-700 ring-rose-500/20",
  "On Leave": "bg-amber-500/10 text-amber-700 ring-amber-500/20",
};

export const STATUS_DOT: Record<CounsellorStatus, string> = {
  Active: "bg-emerald-500",
  Inactive: "bg-rose-500",
  "On Leave": "bg-amber-500",
};
