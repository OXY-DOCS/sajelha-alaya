import React, { useEffect, useMemo, useRef, useState } from "react";
import Tesseract from "tesseract.js";

const STORAGE_KEY = "mr_oxy_saved_invoices_final_v1";

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const importFileRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [status, setStatus] = useState("جاهز");
  const [error, setError] = useState("");
  const [savedInvoices, setSavedInvoices] = useState([]);
  const [invoiceDate, setInvoiceDate] = useState(getTodayDate());
  const [paymentStatus, setPaymentStatus] = useState("غير مدفوع");
  const [activeTab, setActiveTab] = useState("الرئيسية");
  const [selectedSupplier, setSelectedSupplier] = useState("");

  const [searchText, setSearchText] = useState("");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState("الكل");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  const [editSupplier, setEditSupplier] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPaymentStatus, setEditPaymentStatus] = useState("غير مدفوع");
  const [editInvoiceNumber, setEditInvoiceNumber] = useState("");

  useEffect(() => {
    loadSavedInvoices();
    return () => stopCamera();
  }, []);

  const filteredInvoices = useMemo(() => {
    return savedInvoices
      .filter((item) => {
        const matchesSearch =
          !searchText ||
          normalizeSmartText(item.supplier || "").includes(normalizeSmartText(searchText));

        const matchesPayment =
          filterPaymentStatus === "الكل" || item.paymentStatus === filterPaymentStatus;

        const matchesFrom = !dateFrom || item.date >= dateFrom;
        const matchesTo = !dateTo || item.date <= dateTo;

        return matchesSearch && matchesPayment && matchesFrom && matchesTo;
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [savedInvoices, searchText, filterPaymentStatus, dateFrom, dateTo]);

  const supplierGroups = useMemo(() => {
    const groups = {};

    for (const invoice of filteredInvoices) {
      const normalized = normalizeSupplierName(invoice.supplier);

      if (!groups[normalized]) {
        groups[normalized] = {
          supplier: invoice.supplier || "بائع غير معروف",
          invoiceCount: 0,
          totalAmount: 0,
          unpaidAmount: 0,
          paidAmount: 0,
          invoices: []
        };
      }

      const invoiceAmount = parseFloat(invoice.amount) || 0;

      groups[normalized].invoiceCount += 1;
      groups[normalized].totalAmount += invoiceAmount;

      if (invoice.paymentStatus === "غير مدفوع") {
        groups[normalized].unpaidAmount += invoiceAmount;
      } else {
        groups[normalized].paidAmount += invoiceAmount;
      }

      groups[normalized].invoices.push(invoice);
    }

    return Object.values(groups).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredInvoices]);

  const selectedSupplierGroup = useMemo(() => {
    if (!selectedSupplier) return null;
    return (
      supplierGroups.find(
        (group) => normalizeSupplierName(group.supplier) === selectedSupplier
      ) || null
    );
  }, [selectedSupplier, supplierGroups]);

  const unpaidInvoices = useMemo(() => {
    return filteredInvoices
      .filter((item) => item.paymentStatus === "غير مدفوع")
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [filteredInvoices]);

  const duesBySupplier = useMemo(() => {
    const groups = {};

    for (const invoice of unpaidInvoices) {
      const normalized = normalizeSupplierName(invoice.supplier);
      if (!groups[normalized]) {
        groups[normalized] = {
          supplier: invoice.supplier || "بائع غير معروف",
          count: 0,
          total: 0,
          invoices: []
        };
      }

      const invoiceAmount = parseFloat(invoice.amount) || 0;
      groups[normalized].count += 1;
      groups[normalized].total += invoiceAmount;
      groups[normalized].invoices.push(invoice);
    }

    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [unpaidInvoices]);

  const totalSaved = savedInvoices.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const unpaidTotalAll = savedInvoices
    .filter((item) => item.paymentStatus === "غير مدفوع")
    .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const filteredTotal = filteredInvoices.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  const unpaidFilteredTotal = unpaidInvoices.reduce(
    (sum, item) => sum + (parseFloat(item.amount) || 0),
    0
  );

  function loadSavedInvoices() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedInvoices(parsed);
      }
    } catch (e) {
      console.error("Failed to load invoices", e);
    }
  }

  function persistInvoices(invoices) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(invoices));
    setSavedInvoices(invoices);
  }

  async function openCamera() {
    setError("");
    setStatus("جاري فتح الكاميرا...");

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("الكاميرا غير مدعومة");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });

      streamRef.current = stream;
      setCameraOpen(true);
      setStatus("الكاميرا جاهزة");

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err) {
      setError("تعذر فتح الكاميرا. جرّب السماح بإذن الكاميرا أو استخدم اختيار صورة.");
      setStatus("فشل فتح الكاميرا");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }

  async function takePhoto() {
    try {
      setError("");
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        throw new Error("الكاميرا غير جاهزة");
      }

      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, width, height);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      setCapturedImage(dataUrl);

      stopCamera();
      await runOCR(dataUrl);
    } catch (err) {
      setError("لم أستطع التقاط الصورة.");
    }
  }

  function chooseImage() {
    if (fileInputRef.current) fileInputRef.current.click();
  }

  async function onFileChange(e) {
    try {
      setError("");
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const imageDataUrl = reader.result;
        setCapturedImage(imageDataUrl);
        await runOCR(imageDataUrl);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("حدث خطأ أثناء اختيار الصورة.");
    }
  }

  async function runOCR(imageSource) {
    try {
      setLoading(true);
      setStatus("جاري قراءة الفاتورة...");
      setDuplicateWarning("");

      const result = await Tesseract.recognize(imageSource, "eng+ara+heb");
      const text = result?.data?.text || "";

      setOcrText(text);

      const smartData = extractInvoiceTextSmart(text);

      setSupplier(smartData.supplier || "");
      setAmount(smartData.amount || "");
      setInvoiceDate(smartData.date || getTodayDate());
      setInvoiceNumber(smartData.invoiceNumber || "");

      const duplicate = findPossibleDuplicate(
        savedInvoices,
        smartData.supplier,
        smartData.amount,
        smartData.date,
        smartData.invoiceNumber
      );

      if (duplicate) {
        setDuplicateWarning("⚠️ قد تكون هذه الفاتورة مكررة");
      }

      setStatus("تمت القراءة الذكية");
    } catch (err) {
      setError("حدث خطأ أثناء قراءة النص من الفاتورة.");
      setStatus("فشلت القراءة");
    } finally {
      setLoading(false);
    }
  }

  function saveInvoice() {
    if (!capturedImage) {
      setError("لا توجد صورة فاتورة لحفظها.");
      return;
    }

    const finalSupplier = supplier.trim() || "بائع غير معروف";
    const finalAmount = amount.trim() || "0";

    const newInvoice = {
      id: Date.now(),
      supplier: finalSupplier,
      amount: finalAmount,
      date: invoiceDate,
      paymentStatus,
      invoiceNumber: invoiceNumber.trim() || "",
      image: capturedImage,
      ocrText,
      createdAt: new Date().toISOString()
    };

    const updated = [newInvoice, ...savedInvoices];
    persistInvoices(updated);

    setStatus("تم حفظ الفاتورة");
    setError("");
    resetCurrentInvoice();
    setActiveTab("الفواتير");
  }

  function startEditing(invoice) {
    setEditingInvoiceId(invoice.id);
    setEditSupplier(invoice.supplier || "");
    setEditAmount(invoice.amount || "");
    setEditDate(invoice.date || getTodayDate());
    setEditPaymentStatus(invoice.paymentStatus || "غير مدفوع");
    setEditInvoiceNumber(invoice.invoiceNumber || "");
  }

  function cancelEditing() {
    setEditingInvoiceId(null);
    setEditSupplier("");
    setEditAmount("");
    setEditDate("");
    setEditPaymentStatus("غير مدفوع");
    setEditInvoiceNumber("");
  }

  function saveInvoiceEdit() {
    if (!editingInvoiceId) return;

    const updated = savedInvoices.map((item) =>
      item.id === editingInvoiceId
        ? {
            ...item,
            supplier: editSupplier.trim() || "بائع غير معروف",
            amount: editAmount.trim() || "0",
            date: editDate || getTodayDate(),
            paymentStatus: editPaymentStatus,
            invoiceNumber: editInvoiceNumber.trim() || ""
          }
        : item
    );

    persistInvoices(updated);
    setStatus("تم تعديل الفاتورة");
    cancelEditing();
  }

  function deleteInvoice(id) {
    const updated = savedInvoices.filter((item) => item.id !== id);
    persistInvoices(updated);
    if (editingInvoiceId === id) cancelEditing();
  }

  function markInvoicePaid(id) {
    const updated = savedInvoices.map((item) =>
      item.id === id ? { ...item, paymentStatus: "مدفوع" } : item
    );
    persistInvoices(updated);
  }

  function markSupplierInvoicesPaid(normalizedSupplier) {
    const updated = savedInvoices.map((item) =>
      normalizeSupplierName(item.supplier) === normalizedSupplier
        ? { ...item, paymentStatus: "مدفوع" }
        : item
    );
    persistInvoices(updated);
  }

  function resetCurrentInvoice() {
    setCapturedImage(null);
    setOcrText("");
    setSupplier("");
    setAmount("");
    setInvoiceNumber("");
    setDuplicateWarning("");
    setInvoiceDate(getTodayDate());
    setPaymentStatus("غير مدفوع");
  }

  function openSupplierDetails(group) {
    setSelectedSupplier(normalizeSupplierName(group.supplier));
    setActiveTab("تفاصيل المورد");
  }

  function clearFilters() {
    setSearchText("");
    setFilterPaymentStatus("الكل");
    setDateFrom("");
    setDateTo("");
  }

  function exportFilteredInvoicesCSV() {
    const rows = [["اسم المورد", "رقم الفاتورة", "المبلغ", "التاريخ", "حالة الدفع"]];
    filteredInvoices.forEach((item) => {
      rows.push([
        item.supplier || "",
        item.invoiceNumber || "",
        formatMoney(item.amount),
        item.date || "",
        item.paymentStatus || ""
      ]);
    });
    downloadCSV(rows, "invoices-report.csv");
  }

  function exportSuppliersCSV() {
    const rows = [["اسم المورد", "عدد الفواتير", "الإجمالي", "المدفوع", "المتبقي"]];
    supplierGroups.forEach((group) => {
      rows.push([
        group.supplier,
        String(group.invoiceCount),
        group.totalAmount.toFixed(2),
        group.paidAmount.toFixed(2),
        group.unpaidAmount.toFixed(2)
      ]);
    });
    downloadCSV(rows, "suppliers-report.csv");
  }

  function exportDuesCSV() {
    const rows = [["اسم المورد", "عدد الفواتير غير المدفوعة", "إجمالي المستحقات"]];
    duesBySupplier.forEach((group) => {
      rows.push([group.supplier, String(group.count), group.total.toFixed(2)]);
    });
    downloadCSV(rows, "dues-report.csv");
  }

  function printCurrentView() {
    const titleMap = {
      "الرئيسية": "تقرير الرئيسية",
      "الفواتير": "تقرير الفواتير",
      "الموردون": "تقرير الموردين",
      "تفاصيل المورد": "تفاصيل المورد",
      "المستحقات": "تقرير المستحقات"
    };

    let bodyHtml = "";

    if (activeTab === "الفواتير") {
      bodyHtml += `
        <h2>تقرير الفواتير</h2>
        <p>عدد النتائج: ${filteredInvoices.length}</p>
        <p>الإجمالي: ₪ ${filteredTotal.toFixed(2)}</p>
        <table>
          <thead>
            <tr>
              <th>اسم المورد</th>
              <th>رقم الفاتورة</th>
              <th>المبلغ</th>
              <th>التاريخ</th>
              <th>حالة الدفع</th>
            </tr>
          </thead>
          <tbody>
            ${filteredInvoices
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.supplier || "")}</td>
                    <td>${escapeHtml(item.invoiceNumber || "")}</td>
                    <td>₪ ${formatMoney(item.amount)}</td>
                    <td>${escapeHtml(item.date || "")}</td>
                    <td>${escapeHtml(item.paymentStatus || "")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else if (activeTab === "الموردون") {
      bodyHtml += `
        <h2>تقرير الموردين</h2>
        <p>عدد الموردين: ${supplierGroups.length}</p>
        <table>
          <thead>
            <tr>
              <th>اسم المورد</th>
              <th>عدد الفواتير</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
            </tr>
          </thead>
          <tbody>
            ${supplierGroups
              .map(
                (group) => `
                  <tr>
                    <td>${escapeHtml(group.supplier)}</td>
                    <td>${group.invoiceCount}</td>
                    <td>₪ ${group.totalAmount.toFixed(2)}</td>
                    <td>₪ ${group.paidAmount.toFixed(2)}</td>
                    <td>₪ ${group.unpaidAmount.toFixed(2)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else if (activeTab === "المستحقات") {
      bodyHtml += `
        <h2>تقرير المستحقات</h2>
        <p>عدد الفواتير غير المدفوعة: ${unpaidInvoices.length}</p>
        <p>إجمالي المستحقات: ₪ ${unpaidFilteredTotal.toFixed(2)}</p>
        <table>
          <thead>
            <tr>
              <th>اسم المورد</th>
              <th>عدد الفواتير غير المدفوعة</th>
              <th>إجمالي المستحقات</th>
            </tr>
          </thead>
          <tbody>
            ${duesBySupplier
              .map(
                (group) => `
                  <tr>
                    <td>${escapeHtml(group.supplier)}</td>
                    <td>${group.count}</td>
                    <td>₪ ${group.total.toFixed(2)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else if (activeTab === "تفاصيل المورد" && selectedSupplierGroup) {
      bodyHtml += `
        <h2>تفاصيل المورد: ${escapeHtml(selectedSupplierGroup.supplier)}</h2>
        <p>عدد الفواتير: ${selectedSupplierGroup.invoiceCount}</p>
        <p>الإجمالي: ₪ ${selectedSupplierGroup.totalAmount.toFixed(2)}</p>
        <p>المدفوع: ₪ ${selectedSupplierGroup.paidAmount.toFixed(2)}</p>
        <p>المتبقي: ₪ ${selectedSupplierGroup.unpaidAmount.toFixed(2)}</p>
        <table>
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>المبلغ</th>
              <th>التاريخ</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${selectedSupplierGroup.invoices
              .map(
                (item) => `
                  <tr>
                    <td>${escapeHtml(item.invoiceNumber || "")}</td>
                    <td>₪ ${formatMoney(item.amount)}</td>
                    <td>${escapeHtml(item.date || "")}</td>
                    <td>${escapeHtml(item.paymentStatus || "")}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else {
      bodyHtml += `
        <h2>تقرير عام</h2>
        <p>كل الفواتير: ${savedInvoices.length}</p>
        <p>إجمالي الكل: ₪ ${totalSaved.toFixed(2)}</p>
        <p>غير مدفوع: ₪ ${unpaidTotalAll.toFixed(2)}</p>
      `;
    }

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;

    printWindow.document.write(`
      <html dir="rtl">
        <head>
          <title>${titleMap[activeTab] || "تقرير"}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; direction: rtl; }
            h1, h2, h3, p { margin: 0 0 12px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ccc; padding: 10px; text-align: right; }
            th { background: #f3f6fa; }
          </style>
        </head>
        <body>
          <h1>Mr. Oxy - ${titleMap[activeTab] || "تقرير"}</h1>
          <p>تاريخ الطباعة: ${new Date().toLocaleString()}</p>
          ${bodyHtml}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function exportBackup() {
    try {
      const dataStr = JSON.stringify(savedInvoices, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      link.href = url;
      link.download = `backup-invoices-${date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setStatus("تم تنزيل النسخة الاحتياطية ✅");
    } catch (err) {
      setError("فشل إنشاء النسخة الاحتياطية");
    }
  }

  function importBackupClick() {
    if (importFileRef.current) importFileRef.current.click();
  }

  function handleImportFile(e) {
    try {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!Array.isArray(parsed)) {
            throw new Error("ملف غير صالح");
          }

          const confirmReplace = window.confirm(
            "هل تريد استبدال البيانات الحالية؟\n\nاضغط OK للاستبدال\nCancel للدمج"
          );

          if (confirmReplace) {
            persistInvoices(parsed);
          } else {
            const merged = dedupeInvoices([...parsed, ...savedInvoices]);
            persistInvoices(merged);
          }

          setStatus("تم استيراد البيانات بنجاح ✅");
        } catch (err) {
          setError("ملف غير صالح أو تالف ❌");
        }
      };

      reader.readAsText(file);
    } catch (err) {
      setError("حدث خطأ أثناء الاستيراد");
    }
  }

  function renderExportButtons() {
    return (
      <div style={styles.exportBox}>
        <button style={styles.exportButton} onClick={printCurrentView}>
          🖨️ طباعة التقرير
        </button>

        {activeTab === "الفواتير" && (
          <button style={styles.exportButtonSecondary} onClick={exportFilteredInvoicesCSV}>
            ⬇️ تصدير CSV للفواتير
          </button>
        )}

        {activeTab === "الموردون" && (
          <button style={styles.exportButtonSecondary} onClick={exportSuppliersCSV}>
            ⬇️ تصدير CSV للموردين
          </button>
        )}

        {activeTab === "المستحقات" && (
          <button style={styles.exportButtonSecondary} onClick={exportDuesCSV}>
            ⬇️ تصدير CSV للمستحقات
          </button>
        )}

        <button style={styles.exportButtonSecondary} onClick={exportBackup}>
          📥 تنزيل نسخة احتياطية
        </button>

        <button style={styles.exportButtonSecondary} onClick={importBackupClick}>
          📤 استيراد بيانات
        </button>

        <input
          ref={importFileRef}
          type="file"
          accept="application/json"
          onChange={handleImportFile}
          style={{ display: "none" }}
        />
      </div>
    );
  }

  function renderFilters() {
    return (
      <div style={styles.filtersBox}>
        <h3 style={styles.sectionTitle}>البحث والفلترة</h3>

        <div style={styles.formGroup}>
          <label style={styles.labelBlock}>ابحث باسم المورد</label>
          <input
            style={styles.input}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="مثال: النور"
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.labelBlock}>حالة الدفع</label>
          <select
            style={styles.input}
            value={filterPaymentStatus}
            onChange={(e) => setFilterPaymentStatus(e.target.value)}
          >
            <option value="الكل">الكل</option>
            <option value="مدفوع">مدفوع</option>
            <option value="غير مدفوع">غير مدفوع</option>
          </select>
        </div>

        <div style={styles.dateGrid}>
          <div style={styles.formGroup}>
            <label style={styles.labelBlock}>من تاريخ</label>
            <input
              style={styles.input}
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.labelBlock}>إلى تاريخ</label>
            <input
              style={styles.input}
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>

        <div style={styles.actionRow}>
          <button style={styles.resetButton} onClick={clearFilters}>
            مسح الفلاتر
          </button>
        </div>
      </div>
    );
  }

  function renderEditBox() {
    if (!editingInvoiceId) return null;

    return (
      <div style={styles.editBox}>
        <h3 style={styles.sectionTitle}>تعديل الفاتورة</h3>

        <div style={styles.formGroup}>
          <label style={styles.labelBlock}>اسم المورد</label>
          <input style={styles.input} value={editSupplier} onChange={(e) => setEditSupplier(e.target.value)} />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.labelBlock}>المبلغ</label>
          <input style={styles.input} value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.labelBlock}>التاريخ</label>
          <input style={styles.input} type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.labelBlock}>رقم الفاتورة</label>
          <input style={styles.input} value={editInvoiceNumber} onChange={(e) => setEditInvoiceNumber(e.target.value)} />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.labelBlock}>حالة الدفع</label>
          <select style={styles.input} value={editPaymentStatus} onChange={(e) => setEditPaymentStatus(e.target.value)}>
            <option value="غير مدفوع">غير مدفوع</option>
            <option value="مدفوع">مدفوع</option>
          </select>
        </div>

        <div style={styles.actionRow}>
          <button style={styles.saveButton} onClick={saveInvoiceEdit}>حفظ التعديل</button>
          <button style={styles.resetButton} onClick={cancelEditing}>إلغاء</button>
        </div>
      </div>
    );
  }

  function renderHome() {
    return (
      <>
        <div style={styles.statsGrid}>
          <div style={styles.card}><p style={styles.cardTitle}>كل الفواتير</p><h3 style={styles.cardValue}>{savedInvoices.length}</h3></div>
          <div style={styles.card}><p style={styles.cardTitle}>إجمالي الكل</p><h3 style={styles.cardValue}>₪ {totalSaved.toFixed(2)}</h3></div>
          <div style={styles.card}><p style={styles.cardTitle}>غير مدفوع</p><h3 style={styles.cardValue}>₪ {unpaidTotalAll.toFixed(2)}</h3></div>
          <div style={styles.card}><p style={styles.cardTitle}>عدد الموردين</p><h3 style={styles.cardValue}>{Array.from(new Set(savedInvoices.map((x) => normalizeSupplierName(x.supplier)))).length}</h3></div>
        </div>

        <div style={styles.actionBox}>
          <button style={styles.primaryButton} onClick={openCamera}>📸 فتح الكاميرا</button>
          <button style={styles.secondaryButton} onClick={chooseImage}>🖼️ اختيار صورة من الهاتف</button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} style={{ display: "none" }} />
        </div>

        {error ? <div style={styles.errorBox}>{error}</div> : null}

        {cameraOpen ? (
          <div style={styles.cameraCard}>
            <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            <div style={styles.cameraActions}>
              <button style={styles.captureButton} onClick={takePhoto}>✅ التقاط الصورة</button>
              <button style={styles.cancelButton} onClick={stopCamera}>إغلاق</button>
            </div>
          </div>
        ) : null}

        {capturedImage ? (
          <div style={styles.previewCard}>
            <h3 style={styles.sectionTitle}>مراجعة الفاتورة الحالية</h3>
            <img src={capturedImage} alt="فاتورة" style={styles.previewImage} />

            {loading ? (
              <div style={styles.loadingBox}>⏳ جاري تحليل الفاتورة...</div>
            ) : (
              <>
                {duplicateWarning ? <div style={styles.warningBox}>{duplicateWarning}</div> : null}

                <div style={styles.formGroup}>
                  <label style={styles.labelBlock}>اسم البائع</label>
                  <input style={styles.input} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="اكتب اسم البائع" />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.labelBlock}>المبلغ</label>
                  <input style={styles.input} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="اكتب المبلغ" />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.labelBlock}>رقم الفاتورة</label>
                  <input style={styles.input} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="رقم الفاتورة إن وجد" />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.labelBlock}>التاريخ</label>
                  <input style={styles.input} type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.labelBlock}>حالة الدفع</label>
                  <select style={styles.input} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                    <option value="غير مدفوع">غير مدفوع</option>
                    <option value="مدفوع">مدفوع</option>
                  </select>
                </div>

                <div style={styles.actionRow}>
                  <button style={styles.saveButton} onClick={saveInvoice}>💾 حفظ الفاتورة</button>
                  <button style={styles.resetButton} onClick={resetCurrentInvoice}>مسح الحالية</button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {ocrText ? (
          <details style={styles.details}>
            <summary style={{ cursor: "pointer", fontWeight: "bold" }}>عرض النص الكامل المقروء</summary>
            <pre style={styles.ocrText}>{ocrText}</pre>
          </details>
        ) : null}

        {renderExportButtons()}
        <div style={styles.infoBox}><strong>الحالة:</strong> {status}</div>
      </>
    );
  }

  function renderInvoices() {
    return (
      <div style={styles.savedSection}>
        {renderFilters()}
        {renderEditBox()}
        {renderExportButtons()}

        <div style={styles.summaryLine}>
          <span>عدد النتائج: {filteredInvoices.length}</span>
          <span>الإجمالي: ₪ {filteredTotal.toFixed(2)}</span>
        </div>

        <h3 style={styles.sectionTitle}>كل الفواتير</h3>

        {filteredInvoices.length === 0 ? (
          <div style={styles.emptyBox}>لا توجد نتائج مطابقة.</div>
        ) : (
          filteredInvoices.map((item) => (
            <div key={item.id} style={styles.savedInvoiceCard}>
              <img src={item.image} alt={item.supplier} style={styles.savedThumb} />
              <div style={styles.savedInfo}>
                <div style={styles.savedTopRow}>
                  <strong>{item.supplier}</strong>
                  <span style={{ ...styles.statusBadge, background: item.paymentStatus === "مدفوع" ? "#e7f7ec" : "#ffe8e8", color: item.paymentStatus === "مدفوع" ? "#18794e" : "#c62828" }}>{item.paymentStatus}</span>
                </div>
                <p style={styles.savedText}>₪ {formatMoney(item.amount)}</p>
                <p style={styles.savedText}>{item.date}</p>
                {item.invoiceNumber ? <p style={styles.savedText}>رقم الفاتورة: {item.invoiceNumber}</p> : null}
                <div style={styles.savedButtons}>
                  <button style={styles.smallEditButton} onClick={() => startEditing(item)}>تعديل</button>
                  {item.paymentStatus !== "مدفوع" && <button style={styles.smallPaidButton} onClick={() => markInvoicePaid(item.id)}>تم الدفع</button>}
                  <button style={styles.smallDeleteButton} onClick={() => deleteInvoice(item.id)}>حذف</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  function renderSuppliers() {
    return (
      <div style={styles.savedSection}>
        {renderFilters()}
        {renderExportButtons()}

        <div style={styles.summaryLine}>
          <span>عدد الموردين: {supplierGroups.length}</span>
          <span>الإجمالي: ₪ {filteredTotal.toFixed(2)}</span>
        </div>

        <h3 style={styles.sectionTitle}>تجميع الموردين</h3>

        {supplierGroups.length === 0 ? (
          <div style={styles.emptyBox}>لا توجد نتائج موردين مطابقة.</div>
        ) : (
          supplierGroups.map((group) => (
            <div key={normalizeSupplierName(group.supplier)} style={styles.supplierCard}>
              <div style={styles.savedTopRow}>
                <strong style={{ fontSize: "18px" }}>{group.supplier}</strong>
                <button style={styles.openButton} onClick={() => openSupplierDetails(group)}>فتح</button>
              </div>
              <div style={styles.supplierStatsGrid}>
                <div style={styles.supplierStatBox}><span style={styles.smallLabel}>عدد الفواتير</span><strong>{group.invoiceCount}</strong></div>
                <div style={styles.supplierStatBox}><span style={styles.smallLabel}>الإجمالي</span><strong>₪ {group.totalAmount.toFixed(2)}</strong></div>
                <div style={styles.supplierStatBox}><span style={styles.smallLabel}>المدفوع</span><strong style={{ color: "#18794e" }}>₪ {group.paidAmount.toFixed(2)}</strong></div>
                <div style={styles.supplierStatBox}><span style={styles.smallLabel}>المتبقي</span><strong style={{ color: "#c62828" }}>₪ {group.unpaidAmount.toFixed(2)}</strong></div>
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  function renderSupplierDetails() {
    if (!selectedSupplierGroup) return <div style={styles.emptyBox}>لم يتم اختيار مورد.</div>;

    return (
      <div style={styles.savedSection}>
        {renderEditBox()}
        {renderExportButtons()}

        <div style={styles.savedTopRow}>
          <h3 style={{ margin: 0 }}>{selectedSupplierGroup.supplier}</h3>
          <button style={styles.backButton} onClick={() => setActiveTab("الموردون")}>رجوع</button>
        </div>

        <div style={styles.supplierStatsGrid}>
          <div style={styles.supplierStatBox}><span style={styles.smallLabel}>عدد الفواتير</span><strong>{selectedSupplierGroup.invoiceCount}</strong></div>
          <div style={styles.supplierStatBox}><span style={styles.smallLabel}>الإجمالي</span><strong>₪ {selectedSupplierGroup.totalAmount.toFixed(2)}</strong></div>
          <div style={styles.supplierStatBox}><span style={styles.smallLabel}>المدفوع</span><strong style={{ color: "#18794e" }}>₪ {selectedSupplierGroup.paidAmount.toFixed(2)}</strong></div>
          <div style={styles.supplierStatBox}><span style={styles.smallLabel}>المتبقي</span><strong style={{ color: "#c62828" }}>₪ {selectedSupplierGroup.unpaidAmount.toFixed(2)}</strong></div>
        </div>

        <h4 style={{ marginTop: "18px" }}>فواتير المورد</h4>

        {selectedSupplierGroup.invoices.map((item) => (
          <div key={item.id} style={styles.savedInvoiceCard}>
            <img src={item.image} alt={item.supplier} style={styles.savedThumb} />
            <div style={styles.savedInfo}>
              <div style={styles.savedTopRow}>
                <strong>{item.supplier}</strong>
                <span style={{ ...styles.statusBadge, background: item.paymentStatus === "مدفوع" ? "#e7f7ec" : "#ffe8e8", color: item.paymentStatus === "مدفوع" ? "#18794e" : "#c62828" }}>{item.paymentStatus}</span>
              </div>
              <p style={styles.savedText}>₪ {formatMoney(item.amount)}</p>
              <p style={styles.savedText}>{item.date}</p>
              {item.invoiceNumber ? <p style={styles.savedText}>رقم الفاتورة: {item.invoiceNumber}</p> : null}
              <div style={styles.savedButtons}>
                <button style={styles.smallEditButton} onClick={() => startEditing(item)}>تعديل</button>
                {item.paymentStatus !== "مدفوع" && <button style={styles.smallPaidButton} onClick={() => markInvoicePaid(item.id)}>تم الدفع</button>}
                <button style={styles.smallDeleteButton} onClick={() => deleteInvoice(item.id)}>حذف</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderDues() {
    return (
      <div style={styles.savedSection}>
        {renderFilters()}
        {renderEditBox()}
        {renderExportButtons()}

        <div style={styles.duesSummaryBox}>
          <div style={styles.duesSummaryItem}><span style={styles.smallLabel}>عدد الفواتير غير المدفوعة</span><strong>{unpaidInvoices.length}</strong></div>
          <div style={styles.duesSummaryItem}><span style={styles.smallLabel}>إجمالي المستحقات</span><strong style={{ color: "#c62828" }}>₪ {unpaidFilteredTotal.toFixed(2)}</strong></div>
        </div>

        <h3 style={styles.sectionTitle}>المستحقات</h3>

        {duesBySupplier.length === 0 ? (
          <div style={styles.emptyBox}>لا توجد نتائج مستحقات مطابقة.</div>
        ) : (
          duesBySupplier.map((group) => (
            <div key={normalizeSupplierName(group.supplier)} style={styles.dueSupplierCard}>
              <div style={styles.savedTopRow}>
                <div>
                  <strong style={{ fontSize: "18px" }}>{group.supplier}</strong>
                  <p style={styles.savedText}>{group.count} فواتير غير مدفوعة</p>
                </div>
                <div style={{ textAlign: "left" }}><strong style={{ color: "#c62828", fontSize: "18px" }}>₪ {group.total.toFixed(2)}</strong></div>
              </div>

              <div style={styles.savedButtons}>
                <button style={styles.payAllButton} onClick={() => markSupplierInvoicesPaid(normalizeSupplierName(group.supplier))}>تم دفع الكل لهذا المورد</button>
              </div>

              <div style={{ marginTop: "12px" }}>
                {group.invoices.map((item) => (
                  <div key={item.id} style={styles.dueInvoiceRow}>
                    <div>
                      <p style={{ margin: 0, fontWeight: "bold" }}>₪ {formatMoney(item.amount)}</p>
                      <p style={styles.savedText}>{item.date}</p>
                      {item.invoiceNumber ? <p style={styles.savedText}>رقم: {item.invoiceNumber}</p> : null}
                    </div>
                    <div style={styles.savedButtons}>
                      <button style={styles.smallEditButton} onClick={() => startEditing(item)}>تعديل</button>
                      <button style={styles.smallPaidButton} onClick={() => markInvoicePaid(item.id)}>تم الدفع</button>
                      <button style={styles.smallDeleteButton} onClick={() => deleteInvoice(item.id)}>حذف</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div style={styles.container} dir="rtl">
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>مرحبًا حسام 👋</h2>
        <p style={styles.subHeader}>نظام فواتير الشراء الذكي</p>
      </div>

      {activeTab === "الرئيسية" && renderHome()}
      {activeTab === "الفواتير" && renderInvoices()}
      {activeTab === "الموردون" && renderSuppliers()}
      {activeTab === "تفاصيل المورد" && renderSupplierDetails()}
      {activeTab === "المستحقات" && renderDues()}

      <div style={styles.menu}>
        <button style={activeTab === "الرئيسية" ? styles.middleTextBtn : styles.menuTextBtn} onClick={() => setActiveTab("الرئيسية")}>الرئيسية</button>
        <button style={activeTab === "الفواتير" ? styles.middleTextBtn : styles.menuTextBtn} onClick={() => setActiveTab("الفواتير")}>الفواتير</button>
        <button style={activeTab === "الموردون" ? styles.middleTextBtn : styles.menuTextBtn} onClick={() => setActiveTab("الموردون")}>الموردون</button>
        <button style={activeTab === "المستحقات" ? styles.middleTextBtn : styles.menuTextBtn} onClick={() => setActiveTab("المستحقات")}>المستحقات</button>
      </div>
    </div>
  );
}

function extractInvoiceTextSmart(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => cleanLine(line))
    .filter(Boolean);

  return {
    supplier: findBestSupplier(lines),
    amount: findBestAmount(lines, text),
    date: findBestDate(text),
    invoiceNumber: findInvoiceNumber(lines, text)
  };
}

function cleanLine(line) {
  return String(line || "")
    .replace(/\s+/g, " ")
    .replace(/[|]/g, "")
    .trim();
}

function normalizeSmartText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\u0590-\u05FF\u0600-\u06FFa-z0-9\s.:/-]/g, "")
    .trim();
}

function findBestSupplier(lines) {
  const ignoreWords = [
    "invoice", "receipt", "tax", "total", "subtotal", "vat", "cash", "date",
    "phone", "tel", "fax", "www", "http", "email", "חשבונית", "קבלה", "סהכ",
    "סה\"כ", "מעמ", "תאריך", "טל", "פקס", "מס", "חשבון", "grand total"
  ];

  let bestLine = "";
  let bestScore = -1;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    const normalized = normalizeSmartText(line);
    if (!normalized) continue;

    const hasLetters = /[A-Za-z\u0600-\u06FF\u0590-\u05FF]/.test(line);
    if (!hasLetters) continue;

    let score = 0;
    if (i === 0) score += 6;
    if (i === 1) score += 5;
    if (i === 2) score += 4;
    if (line.length >= 4 && line.length <= 40) score += 4;
    if (/[א-ת]/.test(line)) score += 2;
    if (/[ء-ي]/.test(line)) score += 2;
    if (/[A-Za-z]/.test(line)) score += 1;
    if (/בעמ|בע"מ|ltd|co|company|store|market|trading|super|shop/i.test(line)) score += 4;
    if (/\d{3,}/.test(line)) score -= 3;
    if (ignoreWords.some((w) => normalized.includes(w))) score -= 6;
    if (/^\d+$/.test(normalized)) score -= 5;

    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  return bestLine || "";
}

function findBestAmount(lines, fullText) {
  const keywords = [
    "total", "grand total", "subtotal", "balance due", "amount due", "סהכ", "סה\"כ",
    "סך הכל", "לתשלום", "סכום", "סהכ לתשלום", "الاجمالي", "الإجمالي", "المجموع",
    "المبلغ", "الاجمالي للدفع", "اجمالي", "المطلوب"
  ];

  const candidateAmounts = [];

  for (const line of lines) {
    const normalized = normalizeSmartText(line);
    const amounts = extractMoneyNumbers(line);
    if (!amounts.length) continue;

    let scoreBase = 0;
    if (keywords.some((k) => normalized.includes(k))) scoreBase += 10;
    if (/₪|nis|ils/i.test(line)) scoreBase += 4;
    if (/vat|מעמ|ضريبة/i.test(line)) scoreBase -= 2;
    if (/discount|הנחה|خصم/i.test(line)) scoreBase -= 2;
    if (/subtotal/i.test(line)) scoreBase -= 1;

    amounts.forEach((amt) => {
      candidateAmounts.push({ value: amt, score: scoreBase + amt / 1000 });
    });
  }

  if (candidateAmounts.length) {
    candidateAmounts.sort((a, b) => b.score - a.score || b.value - a.value);
    return candidateAmounts[0].value.toFixed(2);
  }

  const allNums = extractMoneyNumbers(fullText).filter((n) => n >= 1);
  if (!allNums.length) return "";
  return Math.max(...allNums).toFixed(2);
}

function extractMoneyNumbers(text) {
  const matches = String(text || "").match(/\d+[.,]?\d{0,2}/g) || [];
  return matches
    .map((v) => parseFloat(v.replace(",", ".")))
    .filter((v) => !Number.isNaN(v) && v > 0);
}

function findBestDate(text) {
  const patterns = [
    /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g,
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g,
    /\b(\d{1,2})[.](\d{1,2})[.](\d{2,4})\b/g
  ];

  for (const pattern of patterns) {
    const matches = [...String(text || "").matchAll(pattern)];
    for (const m of matches) {
      const normalized = normalizeDateString(m[0]);
      if (normalized) return normalized;
    }
  }

  return "";
}

function normalizeDateString(raw) {
  const clean = String(raw || "").replace(/[.]/g, "/").replace(/-/g, "/");
  const parts = clean.split("/");
  if (parts.length !== 3) return "";

  let y, m, d;
  if (parts[0].length === 4) {
    y = Number(parts[0]);
    m = Number(parts[1]);
    d = Number(parts[2]);
  } else {
    d = Number(parts[0]);
    m = Number(parts[1]);
    y = Number(parts[2]);
    if (y < 100) y += 2000;
  }

  if (y < 2000 || y > 2100) return "";
  if (m < 1 || m > 12) return "";
  if (d < 1 || d > 31) return "";

  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function findInvoiceNumber(lines, text) {
  const directPatterns = [
    /(invoice\s*no\.?|invoice\s*#|no\.?|receipt\s*no\.?|חשבונית\s*מס|מס\.?\s*חשבונית|מספר\s*חשבונית|رقم\s*الفاتورة|فاتورة\s*رقم)\s*[:#-]?\s*([A-Za-z0-9\-/]{3,})/i
  ];

  for (const line of lines) {
    for (const pattern of directPatterns) {
      const m = line.match(pattern);
      if (m && m[2]) return m[2];
    }
  }

  const fallback = String(text || "").match(/\b[A-Za-z]{0,3}\d{4,}\b/);
  return fallback ? fallback[0] : "";
}

function findPossibleDuplicate(invoices, supplier, amount, date, invoiceNumber) {
  const normalizedSupplier = normalizeSupplierName(supplier || "");
  const normalizedAmount = Number(parseFloat(amount) || 0).toFixed(2);
  const normalizedInvoiceNumber = String(invoiceNumber || "").trim().toLowerCase();

  return invoices.some((item) => {
    const sameSupplier = normalizeSupplierName(item.supplier) === normalizedSupplier;
    const sameAmount = Number(parseFloat(item.amount) || 0).toFixed(2) === normalizedAmount;
    const sameDate = (item.date || "") === (date || "");
    const sameInvoiceNumber =
      normalizedInvoiceNumber &&
      String(item.invoiceNumber || "").trim().toLowerCase() === normalizedInvoiceNumber;

    return (sameSupplier && sameAmount && sameDate) || sameInvoiceNumber;
  });
}

function dedupeInvoices(invoices) {
  const seen = new Set();
  const result = [];

  for (const item of invoices) {
    const key = [
      normalizeSupplierName(item.supplier),
      Number(parseFloat(item.amount) || 0).toFixed(2),
      item.date || "",
      String(item.invoiceNumber || "").trim().toLowerCase()
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function getTodayDate() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeSupplierName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function formatMoney(value) {
  const n = parseFloat(value) || 0;
  return n.toFixed(2);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function downloadCSV(rows, filename) {
  const csvContent = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const styles = {
  container: { fontFamily: "Arial, sans-serif", padding: "15px", background: "#f5f7fa", minHeight: "100vh", paddingBottom: "90px", maxWidth: "480px", margin: "0 auto" },
  header: { marginBottom: "16px" },
  subHeader: { margin: "6px 0 0 0", color: "#666" },
  statsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" },
  card: { background: "white", padding: "14px", borderRadius: "12px", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" },
  cardTitle: { margin: "0 0 8px 0", color: "#666", fontSize: "14px" },
  cardValue: { margin: 0, fontSize: "22px" },
  actionBox: { background: "#ffffff", padding: "14px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "16px" },
  primaryButton: { width: "100%", padding: "14px", background: "#2196f3", color: "#fff", border: "none", borderRadius: "12px", fontSize: "18px", cursor: "pointer", marginBottom: "10px" },
  secondaryButton: { width: "100%", padding: "14px", background: "#fff", color: "#2196f3", border: "2px solid #2196f3", borderRadius: "12px", fontSize: "16px", cursor: "pointer" },
  filtersBox: { background: "#ffffff", padding: "14px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "16px" },
  editBox: { background: "#fffbea", padding: "14px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "16px", border: "1px solid #f4d35e" },
  exportBox: { display: "flex", flexDirection: "column", gap: "10px", background: "#ffffff", padding: "14px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "16px" },
  exportButton: { width: "100%", padding: "12px", background: "#5b21b6", color: "#fff", border: "none", borderRadius: "10px", fontSize: "16px", cursor: "pointer" },
  exportButtonSecondary: { width: "100%", padding: "12px", background: "#ede9fe", color: "#5b21b6", border: "none", borderRadius: "10px", fontSize: "16px", cursor: "pointer" },
  errorBox: { background: "#ffe5e5", color: "#c62828", padding: "12px", borderRadius: "12px", marginBottom: "16px", fontWeight: "bold" },
  warningBox: { background: "#fff3cd", color: "#7a5d00", padding: "12px", borderRadius: "12px", marginBottom: "12px", fontWeight: "bold" },
  cameraCard: { background: "#fff", padding: "12px", borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "16px" },
  video: { width: "100%", borderRadius: "12px", background: "#000" },
  cameraActions: { display: "flex", gap: "10px", marginTop: "12px" },
  captureButton: { flex: 1, padding: "12px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "16px" },
  cancelButton: { flex: 1, padding: "12px", background: "#757575", color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "16px" },
  previewCard: { background: "white", padding: "15px", borderRadius: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", marginBottom: "16px" },
  previewImage: { width: "100%", borderRadius: "10px", display: "block", marginBottom: "14px" },
  loadingBox: { background: "#fff3cd", color: "#7a5d00", padding: "12px", borderRadius: "12px", marginBottom: "10px", fontWeight: "bold" },
  formGroup: { marginBottom: "12px" },
  labelBlock: { display: "block", marginBottom: "6px", fontWeight: "bold" },
  input: { width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #d0d7de", fontSize: "16px", boxSizing: "border-box" },
  dateGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" },
  actionRow: { display: "flex", gap: "10px", marginTop: "14px" },
  saveButton: { flex: 1, padding: "12px", background: "#0b8f55", color: "white", border: "none", borderRadius: "10px", fontSize: "16px", cursor: "pointer" },
  resetButton: { flex: 1, padding: "12px", background: "#e0e0e0", color: "#222", border: "none", borderRadius: "10px", fontSize: "16px", cursor: "pointer" },
  details: { background: "#fff", padding: "12px", borderRadius: "12px", marginBottom: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
  ocrText: { whiteSpace: "pre-wrap", fontSize: "12px", direction: "ltr", marginTop: "12px", background: "#f8f8f8", padding: "10px", borderRadius: "8px" },
  infoBox: { background: "#eef6ff", borderRadius: "12px", padding: "12px", color: "#0b4f8a" },
  savedSection: { marginBottom: "20px" },
  sectionTitle: { margin: "0 0 12px 0" },
  summaryLine: { display: "flex", justifyContent: "space-between", gap: "10px", background: "#eef6ff", borderRadius: "12px", padding: "12px", marginBottom: "12px", color: "#0b4f8a", fontWeight: "bold", flexWrap: "wrap" },
  emptyBox: { background: "#fff", padding: "14px", borderRadius: "12px", color: "#666", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  savedInvoiceCard: { background: "#fff", borderRadius: "12px", padding: "10px", marginBottom: "12px", display: "flex", gap: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  savedThumb: { width: "90px", height: "90px", objectFit: "cover", borderRadius: "10px", flexShrink: 0 },
  savedInfo: { flex: 1 },
  savedTopRow: { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" },
  statusBadge: { padding: "5px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: "bold" },
  savedText: { margin: "8px 0 0 0", color: "#444" },
  savedButtons: { marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" },
  smallDeleteButton: { padding: "8px 12px", background: "#fbe9e9", color: "#c62828", border: "none", borderRadius: "8px", cursor: "pointer" },
  smallPaidButton: { padding: "8px 12px", background: "#e7f7ec", color: "#18794e", border: "none", borderRadius: "8px", cursor: "pointer" },
  smallEditButton: { padding: "8px 12px", background: "#fff4d6", color: "#9a6700", border: "none", borderRadius: "8px", cursor: "pointer" },
  supplierCard: { background: "#fff", borderRadius: "12px", padding: "14px", marginBottom: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  supplierStatsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" },
  supplierStatBox: { background: "#f8fbff", padding: "12px", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "6px" },
  smallLabel: { color: "#666", fontSize: "13px" },
  openButton: { padding: "8px 12px", background: "#2196f3", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
  backButton: { padding: "8px 12px", background: "#e0e0e0", color: "#222", border: "none", borderRadius: "8px", cursor: "pointer" },
  duesSummaryBox: { background: "#fff5f5", borderRadius: "12px", padding: "14px", marginBottom: "14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
  duesSummaryItem: { background: "white", borderRadius: "10px", padding: "12px", display: "flex", flexDirection: "column", gap: "6px" },
  dueSupplierCard: { background: "#fff", borderRadius: "12px", padding: "14px", marginBottom: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1px solid #ffe0e0" },
  dueInvoiceRow: { background: "#fafafa", borderRadius: "10px", padding: "12px", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" },
  payAllButton: { padding: "10px 14px", background: "#0b8f55", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
  menu: { position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: "480px", margin: "0 auto", background: "white", display: "flex", justifyContent: "space-around", padding: "10px", borderTop: "1px solid #ddd", gap: "8px", overflowX: "auto" },
  menuTextBtn: { flex: 1, background: "transparent", border: "none", fontSize: "15px", padding: "10px", cursor: "pointer", borderRadius: "10px", minWidth: "80px" },
  middleTextBtn: { flex: 1, background: "#2196f3", color: "white", border: "none", fontSize: "15px", padding: "10px", cursor: "pointer", borderRadius: "10px", minWidth: "80px" }
};
