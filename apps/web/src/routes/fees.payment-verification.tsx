import { createFileRoute } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useMemo, useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Download,
  FileText,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

const searchSchema = z.object({
  tab: fallback(z.enum(["unverified", "verified"]), "unverified").default("unverified"),
});

export const Route = createFileRoute("/fees/payment-verification")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Payment Verification — upCarrera" },
      {
        name: "description",
        content:
          "Finance team verification workspace for submitted fee payments. Approve, reject and audit every transaction.",
      },
    ],
  }),
  component: PaymentVerification,
});

// ---------------- Types & Mock Data ----------------
type Status = "Unverified" | "Verified" | "Rejected";
type PaymentMode = "UPI" | "NEFT" | "RTGS" | "Cash" | "Card" | "Cheque";

interface Payment {
  id: string;
  receiptNo: string;
  studentId: string;
  student: string;
  university: string;
  course: string;
  instalment: string;
  amount: number;
  mode: PaymentMode;
  txnId: string;
  proofUrl: string;
  submittedDate: string;
  submittedBy: string;
  status: Status;
  verifiedBy?: string;
  verificationDate?: string;
  rejectionReason?: string;
  remarks?: string;
}

const seed: Payment[] = [
  {
    id: "P-1001",
    receiptNo: "RCP-2026-1001",
    studentId: "STU-2401",
    student: "Aarav Sharma",
    university: "Amity University Online",
    course: "MBA",
    instalment: "Sem 1 - Inst 2",
    amount: 35000,
    mode: "UPI",
    txnId: "UPI9823746512",
    proofUrl: "/receipts/p-1001.jpg",
    submittedDate: "2026-06-17",
    submittedBy: "Riya Mehta",
    status: "Unverified",
  },
  {
    id: "P-1002",
    receiptNo: "RCP-2026-1002",
    studentId: "STU-2402",
    student: "Ishita Verma",
    university: "Manipal University Jaipur",
    course: "BBA",
    instalment: "Sem 2 - Inst 1",
    amount: 28000,
    mode: "NEFT",
    txnId: "NEFT00982341",
    proofUrl: "/receipts/p-1002.pdf",
    submittedDate: "2026-06-17",
    submittedBy: "Karan Patel",
    status: "Unverified",
  },
  {
    id: "P-1003",
    receiptNo: "RCP-2026-1003",
    studentId: "STU-2403",
    student: "Rohan Iyer",
    university: "Chandigarh University",
    course: "MCA",
    instalment: "Sem 1 - Inst 1",
    amount: 42000,
    mode: "RTGS",
    txnId: "RTGS-77621",
    proofUrl: "/receipts/p-1003.pdf",
    submittedDate: "2026-06-16",
    submittedBy: "Priya Nair",
    status: "Unverified",
  },
  {
    id: "P-1004",
    receiptNo: "RCP-2026-0998",
    studentId: "STU-2398",
    student: "Megha Kapoor",
    university: "Amity University Online",
    course: "BCA",
    instalment: "Sem 1 - Inst 2",
    amount: 22000,
    mode: "UPI",
    txnId: "UPI7712398765",
    proofUrl: "/receipts/p-0998.jpg",
    submittedDate: "2026-06-18",
    submittedBy: "Riya Mehta",
    status: "Verified",
    verifiedBy: "Anita Desai",
    verificationDate: "2026-06-18",
  },
  {
    id: "P-1005",
    receiptNo: "RCP-2026-0997",
    studentId: "STU-2397",
    student: "Vikram Singh",
    university: "Lovely Professional University",
    course: "MBA",
    instalment: "Sem 2 - Inst 2",
    amount: 38000,
    mode: "Card",
    txnId: "TXN-CARD-22198",
    proofUrl: "/receipts/p-0997.pdf",
    submittedDate: "2026-06-15",
    submittedBy: "Karan Patel",
    status: "Verified",
    verifiedBy: "Anita Desai",
    verificationDate: "2026-06-15",
  },
  {
    id: "P-1006",
    receiptNo: "RCP-2026-0995",
    studentId: "STU-2391",
    student: "Sneha Pillai",
    university: "Manipal University Jaipur",
    course: "MBA",
    instalment: "Sem 1 - Inst 1",
    amount: 15000,
    mode: "Cash",
    txnId: "CASH-0091",
    proofUrl: "/receipts/p-0995.jpg",
    submittedDate: "2026-06-14",
    submittedBy: "Priya Nair",
    status: "Rejected",
    rejectionReason: "Proof unreadable",
    remarks: "Please re-upload a clearer copy of the bank slip.",
  },
];

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

function StatusBadge({ s }: { s: Status }) {
  if (s === "Verified")
    return (
      <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Verified</Badge>
    );
  if (s === "Rejected")
    return <Badge className="bg-rose-500/10 text-rose-600 border border-rose-500/20">Rejected</Badge>;
  return <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/20">Unverified</Badge>;
}

// ---------------- Component ----------------
function PaymentVerification() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [rows, setRows] = useState<Payment[]>(seed);
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState<Payment | null>(null);
  const [rejectOpen, setRejectOpen] = useState<Payment | null>(null);
  const [proofOpen, setProofOpen] = useState<Payment | null>(null);
  const [receiptOpen, setReceiptOpen] = useState<Payment | null>(null);
  const [paymentOpen, setPaymentOpen] = useState<Payment | null>(null);
  const [rejection, setRejection] = useState({ reason: "", remarks: "" });

  const today = new Date().toISOString().slice(0, 10);

  const kpis = useMemo(() => {
    const pending = rows.filter((r) => r.status === "Unverified").length;
    const verifiedToday = rows.filter((r) => r.status === "Verified" && r.verificationDate === today).length;
    const rejected = rows.filter((r) => r.status === "Rejected").length;
    return { pending, verifiedToday, rejected };
  }, [rows, today]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "unverified" && r.status !== "Unverified") return false;
      if (tab === "verified" && r.status !== "Verified") return false;
      if (!q) return true;
      return (
        r.student.toLowerCase().includes(q) ||
        r.receiptNo.toLowerCase().includes(q) ||
        r.txnId.toLowerCase().includes(q) ||
        r.university.toLowerCase().includes(q)
      );
    });
  }, [rows, tab, query]);

  const setTab = (t: "unverified" | "verified") =>
    navigate({ search: () => ({ tab: t }) });

  const handleVerify = () => {
    if (!verifyOpen) return;
    setRows((prev) =>
      prev.map((r) =>
        r.id === verifyOpen.id
          ? { ...r, status: "Verified", verifiedBy: "Anita Desai", verificationDate: today }
          : r,
      ),
    );
    toast.success(`Payment ${verifyOpen.receiptNo} verified. Logged in Audit.`);
    setVerifyOpen(null);
  };

  const handleReject = () => {
    if (!rejectOpen) return;
    if (!rejection.reason) {
      toast.error("Select a rejection reason");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.id === rejectOpen.id
          ? { ...r, status: "Rejected", rejectionReason: rejection.reason, remarks: rejection.remarks }
          : r,
      ),
    );
    toast.success(`Payment ${rejectOpen.receiptNo} rejected. Logged in Audit.`);
    setRejectOpen(null);
    setRejection({ reason: "", remarks: "" });
  };

  const downloadReceipt = (p: Payment) => {
    const text = `Receipt\n\nReceipt No: ${p.receiptNo}\nStudent: ${p.student}\nUniversity: ${p.university}\nCourse: ${p.course}\nInstalment: ${p.instalment}\nAmount: ${fmtINR(p.amount)}\nMode: ${p.mode}\nTxn ID: ${p.txnId}\nVerified By: ${p.verifiedBy ?? "-"}\nVerification Date: ${p.verificationDate ?? "-"}\n`;
    const blob = new Blob([text], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.receiptNo}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Receipt downloaded");
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Payment Verification
          </h1>
          <p className="text-sm text-muted-foreground">
            Review submitted payments. Only verified payments update final collected amount.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-md transition" onClick={() => setTab("unverified")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.pending}</div>
            <p className="text-xs text-muted-foreground">Awaiting finance review</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition" onClick={() => setTab("verified")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Verified Today</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.verifiedToday}</div>
            <p className="text-xs text-muted-foreground">Counted into collected amount</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Rejected Payments</CardTitle>
            <XCircle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.rejected}</div>
            <p className="text-xs text-muted-foreground">Not included in collections</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs + Search */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as "unverified" | "verified")}>
              <TabsList>
                <TabsTrigger value="unverified">Unverified</TabsTrigger>
                <TabsTrigger value="verified">Verified</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search receipt, student, txn ID…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 w-72"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab}>
            <TabsContent value="unverified" className="m-0">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt No</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>University</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead>Instalment</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Txn ID</TableHead>
                      <TableHead>Proof</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Submitted By</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                          No unverified payments.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.receiptNo}</TableCell>
                          <TableCell>{p.student}</TableCell>
                          <TableCell>{p.university}</TableCell>
                          <TableCell>{p.course}</TableCell>
                          <TableCell>{p.instalment}</TableCell>
                          <TableCell className="text-right">{fmtINR(p.amount)}</TableCell>
                          <TableCell>{p.mode}</TableCell>
                          <TableCell className="font-mono text-xs">{p.txnId}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => setProofOpen(p)}>
                              <Eye className="h-4 w-4" /> View
                            </Button>
                          </TableCell>
                          <TableCell>{p.submittedDate}</TableCell>
                          <TableCell>{p.submittedBy}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => setProofOpen(p)}>
                                Proof
                              </Button>
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => setVerifyOpen(p)}
                              >
                                <CheckCircle2 className="h-4 w-4" /> Verify
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => setRejectOpen(p)}>
                                <XCircle className="h-4 w-4" /> Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="verified" className="m-0">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt No</TableHead>
                      <TableHead>Student</TableHead>
                      <TableHead>University</TableHead>
                      <TableHead>Course</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Verified By</TableHead>
                      <TableHead>Verification Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No verified payments.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.receiptNo}</TableCell>
                          <TableCell>{p.student}</TableCell>
                          <TableCell>{p.university}</TableCell>
                          <TableCell>{p.course}</TableCell>
                          <TableCell className="text-right">{fmtINR(p.amount)}</TableCell>
                          <TableCell>{p.mode}</TableCell>
                          <TableCell>{p.verifiedBy}</TableCell>
                          <TableCell>{p.verificationDate}</TableCell>
                          <TableCell>
                            <StatusBadge s={p.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => setReceiptOpen(p)}>
                                <FileText className="h-4 w-4" /> Receipt
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => downloadReceipt(p)}>
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setPaymentOpen(p)}>
                                <Eye className="h-4 w-4" /> Payment
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Verify Modal */}
      <Dialog open={!!verifyOpen} onOpenChange={(o) => !o && setVerifyOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Payment</DialogTitle>
            <DialogDescription>Confirm details before marking this payment as verified.</DialogDescription>
          </DialogHeader>
          {verifyOpen && (
            <div className="space-y-3 text-sm">
              <Row k="Student" v={verifyOpen.student} />
              <Row k="Amount" v={fmtINR(verifyOpen.amount)} />
              <Row k="Payment Date" v={verifyOpen.submittedDate} />
              <Row k="Payment Mode" v={verifyOpen.mode} />
              <Row k="Transaction ID" v={verifyOpen.txnId} />
              <div className="mt-2 rounded-md border bg-muted/30 p-4 text-center">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">Proof preview: {verifyOpen.proofUrl}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyOpen(null)}>
              Cancel
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleVerify}>
              <CheckCircle2 className="h-4 w-4" /> Verify Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Modal */}
      <Dialog
        open={!!rejectOpen}
        onOpenChange={(o) => {
          if (!o) {
            setRejectOpen(null);
            setRejection({ reason: "", remarks: "" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payment</DialogTitle>
            <DialogDescription>
              {rejectOpen ? `${rejectOpen.receiptNo} • ${rejectOpen.student}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Rejection Reason</Label>
              <Select
                value={rejection.reason}
                onValueChange={(v) => setRejection((r) => ({ ...r, reason: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Proof unreadable">Proof unreadable</SelectItem>
                  <SelectItem value="Amount mismatch">Amount mismatch</SelectItem>
                  <SelectItem value="Invalid transaction ID">Invalid transaction ID</SelectItem>
                  <SelectItem value="Duplicate entry">Duplicate entry</SelectItem>
                  <SelectItem value="Bank not credited">Bank not credited</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Remarks</Label>
              <Textarea
                rows={3}
                placeholder="Add internal notes…"
                value={rejection.remarks}
                onChange={(e) => setRejection((r) => ({ ...r, remarks: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              <XCircle className="h-4 w-4" /> Reject Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proof Drawer */}
      <Drawer open={!!proofOpen} onOpenChange={(o) => !o && setProofOpen(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Payment Proof — {proofOpen?.receiptNo}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-3">
            {proofOpen && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Row k="Student" v={proofOpen.student} />
                  <Row k="Amount" v={fmtINR(proofOpen.amount)} />
                  <Row k="Mode" v={proofOpen.mode} />
                  <Row k="Txn ID" v={proofOpen.txnId} />
                </div>
                <div className="rounded-md border bg-muted/30 p-10 text-center">
                  <FileText className="mx-auto h-16 w-16 text-muted-foreground" />
                  <p className="mt-3 text-xs text-muted-foreground">{proofOpen.proofUrl}</p>
                </div>
              </>
            )}
          </div>
          <DrawerFooter>
            <Button variant="outline" onClick={() => setProofOpen(null)}>
              Close
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Receipt Preview */}
      <Dialog open={!!receiptOpen} onOpenChange={(o) => !o && setReceiptOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receipt — {receiptOpen?.receiptNo}</DialogTitle>
          </DialogHeader>
          {receiptOpen && (
            <div className="space-y-2 text-sm">
              <Row k="Student" v={receiptOpen.student} />
              <Row k="University" v={receiptOpen.university} />
              <Row k="Course" v={receiptOpen.course} />
              <Row k="Instalment" v={receiptOpen.instalment} />
              <Row k="Amount" v={fmtINR(receiptOpen.amount)} />
              <Row k="Mode" v={receiptOpen.mode} />
              <Row k="Txn ID" v={receiptOpen.txnId} />
              <Row k="Verified By" v={receiptOpen.verifiedBy ?? "-"} />
              <Row k="Verification Date" v={receiptOpen.verificationDate ?? "-"} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptOpen(null)}>
              Close
            </Button>
            <Button onClick={() => receiptOpen && downloadReceipt(receiptOpen)}>
              <Download className="h-4 w-4" /> Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Drawer */}
      <Drawer open={!!paymentOpen} onOpenChange={(o) => !o && setPaymentOpen(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Payment Details — {paymentOpen?.receiptNo}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-3 text-sm">
            {paymentOpen && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Row k="Student" v={paymentOpen.student} />
                  <Row k="Student ID" v={paymentOpen.studentId} />
                  <Row k="University" v={paymentOpen.university} />
                  <Row k="Course" v={paymentOpen.course} />
                  <Row k="Instalment" v={paymentOpen.instalment} />
                  <Row k="Amount" v={fmtINR(paymentOpen.amount)} />
                  <Row k="Mode" v={paymentOpen.mode} />
                  <Row k="Txn ID" v={paymentOpen.txnId} />
                  <Row k="Submitted" v={paymentOpen.submittedDate} />
                  <Row k="Submitted By" v={paymentOpen.submittedBy} />
                  <Row k="Verified By" v={paymentOpen.verifiedBy ?? "-"} />
                  <Row k="Verification Date" v={paymentOpen.verificationDate ?? "-"} />
                </div>
                <div>
                  <StatusBadge s={paymentOpen.status} />
                </div>
              </>
            )}
          </div>
          <DrawerFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(null)}>
              Close
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Export Modal */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Verification Report</DialogTitle>
            <DialogDescription>Choose format and scope.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Format</Label>
              <Select defaultValue="excel">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <Select defaultValue="current">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current tab</SelectItem>
                  <SelectItem value="all">All payments</SelectItem>
                  <SelectItem value="rejected">Rejected only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input type="date" />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input type="date" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                toast.success("Export started. File will download shortly.");
                setExportOpen(false);
              }}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed py-1.5 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}
