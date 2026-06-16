import {
  Users,
  Clock,
  Activity,
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

export type StudentStatus =
  | "Pending"
  | "In Progress"
  | "Enrolled"
  | "Passed Out"
  | "Dropout"
  | "Cancelled";

export interface Installment {
  no: number;
  due: string;
  amount: number;
  status: "Paid" | "Pending" | "Overdue";
  paidOn?: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  university: string;
  course: string;
  batch: string;
  enrollmentDate: string;
  coordinator: string;
  coordinatorInitials: string;
  status: StudentStatus;
  totalFee: number;
  paid: number;
  overdue: number;
}

export const STATUS_ORDER: StudentStatus[] = [
  "Pending",
  "In Progress",
  "Enrolled",
  "Passed Out",
  "Dropout",
  "Cancelled",
];

export const STATUS_STYLES: Record<StudentStatus, string> = {
  Pending: "bg-orange-100 text-orange-700 ring-orange-200",
  "In Progress": "bg-sky-100 text-sky-700 ring-sky-200",
  Enrolled: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  "Passed Out": "bg-primary/10 text-primary ring-primary/20",
  Dropout: "bg-red-100 text-red-700 ring-red-200",
  Cancelled: "bg-slate-100 text-slate-700 ring-slate-200",
};

export const STATUS_DOT: Record<StudentStatus, string> = {
  Pending: "bg-orange-500",
  "In Progress": "bg-sky-500",
  Enrolled: "bg-emerald-500",
  "Passed Out": "bg-primary",
  Dropout: "bg-red-500",
  Cancelled: "bg-slate-400",
};

export const STATUS_ICONS: Record<StudentStatus, typeof Users> = {
  Pending: Clock,
  "In Progress": Activity,
  Enrolled: GraduationCap,
  "Passed Out": CheckCircle2,
  Dropout: AlertTriangle,
  Cancelled: XCircle,
};

export const UNIVERSITIES = [
  "Amity University Online",
  "Manipal University",
  "Jain University",
  "LPU Online",
  "NMIMS Global",
  "DY Patil University",
];
export const COURSES = ["MBA", "BBA", "MCA", "BCA", "M.Com", "B.Com", "MA Psychology"];
export const BATCHES = ["Jan 2026", "Apr 2026", "Jul 2026", "Oct 2026"];
export const COORDINATORS = [
  { name: "Priya Sharma", initials: "PS" },
  { name: "Rahul Verma", initials: "RV" },
  { name: "Aisha Khan", initials: "AK" },
  { name: "Karan Mehta", initials: "KM" },
  { name: "Neha Iyer", initials: "NI" },
];
const FIRST = ["Aarav", "Vivaan", "Aditya", "Ishaan", "Krishna", "Ananya", "Diya", "Saanvi", "Aanya", "Myra", "Riya", "Kabir", "Arjun", "Reyansh", "Dhruv", "Sai", "Tara", "Zara", "Nikhil", "Pooja"];
const LAST = ["Sharma", "Verma", "Patel", "Reddy", "Iyer", "Nair", "Kapoor", "Singh", "Gupta", "Mehta", "Joshi", "Khan", "Das", "Bose", "Mishra"];

function seed(n: number): Student[] {
  const rows: Student[] = [];
  let r = 91;
  const rand = () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
  for (let i = 0; i < n; i++) {
    const first = FIRST[Math.floor(rand() * FIRST.length)];
    const last = LAST[Math.floor(rand() * LAST.length)];
    const status = STATUS_ORDER[Math.floor(rand() * STATUS_ORDER.length)];
    const c = COORDINATORS[Math.floor(rand() * COORDINATORS.length)];
    const day = Math.floor(rand() * 28) + 1;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const month = months[Math.floor(rand() * months.length)];
    const totalFee = Math.floor(rand() * 200000) + 80000;
    const paid = Math.floor(totalFee * (rand() * 0.9 + 0.05));
    const overdue =
      status === "In Progress" && rand() > 0.6 ? Math.floor(rand() * 25000) + 5000 : 0;
    rows.push({
      id: `STU-2026-${String(1024 + i).padStart(6, "0")}`,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@gmail.com`,
      phone: `+91 9${Math.floor(rand() * 900000000 + 100000000)}`,
      university: UNIVERSITIES[Math.floor(rand() * UNIVERSITIES.length)],
      course: COURSES[Math.floor(rand() * COURSES.length)],
      batch: BATCHES[Math.floor(rand() * BATCHES.length)],
      enrollmentDate: `${String(day).padStart(2, "0")} ${month} 2026`,
      coordinator: c.name,
      coordinatorInitials: c.initials,
      status,
      totalFee,
      paid,
      overdue,
    });
  }
  return rows;
}

export const ALL_STUDENTS = seed(56);

export const getStudentById = (id: string) => ALL_STUDENTS.find((s) => s.id === id);

export const formatINR = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
