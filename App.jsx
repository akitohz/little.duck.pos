import React, { useState, useEffect, useRef } from "react";
import {
  Plus, Minus, Trash2, History, X, Banknote, ArrowLeftRight, ArrowLeft,
  Camera, Check, Settings, Package, FolderOpen, QrCode, ChevronRight,
  TrendingUp, Calendar, Store, ArrowRight, Printer, Edit2, Clock
} from "lucide-react";

const PALETTE = ["#BFE3F0", "#C9EFCB", "#FCE9B0", "#F3D3C7"];

// ================= helpers =================
const fmt = (n) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(n || 0);
const paymentLabel = (m) => (m === "cash" ? "เงินสด" : m === "pending" ? "จอง/รอจ่าย" : "โอนเงิน");
const uid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function loadKey(key, fallback) {
  try {
    const res = await window.storage.get(key, false);
    if (res && res.value) return JSON.parse(res.value);
    return fallback;
  } catch (e) {
    return fallback;
  }
}
async function saveKey(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value), false);
  } catch (e) {
    console.error("บันทึกไม่สำเร็จ", e);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- PromptPay QR payload (EMV QR standard) ----------
function crc16(data) {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
function field(id, value) {
  return id + String(value.length).padStart(2, "0") + value;
}
function normalizeTarget(raw) {
  const digits = (raw || "").replace(/[^0-9]/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return { type: "phone", value: "0066" + digits.slice(1) };
  }
  if (digits.length === 13) {
    return { type: "id", value: digits };
  }
  return null;
}
function buildPromptPayPayload(target, amount) {
  const norm = normalizeTarget(target);
  if (!norm) return null;
  let merchant = field("00", "A000000677010111");
  merchant += norm.type === "phone" ? field("01", norm.value) : field("02", norm.value);
  let payload = "";
  payload += field("00", "01");
  payload += field("01", amount ? "12" : "11");
  payload += field("29", merchant);
  payload += field("53", "764");
  if (amount) payload += field("54", Number(amount).toFixed(2));
  payload += field("58", "TH");
  payload += "6304";
  payload += crc16(payload);
  return payload;
}

const ICON_CHOICES = ["🍰", "🎂", "🍫", "🍓", "🧀", "🍪", "🧈", "🌸", "🥐", "🍞", "🍩", "☕", "🍵", "🍊", "🥧", "🧁"];
const TOPPING_ICONS = ["🍫", "🍓", "🫐", "🍌", "🍊", "🥥", "🍋", "🍪", "🌰", "🧁", "🎀", "🎁", "🏞️"];

// ================= Image cropper =================
function ImageCropper({ src, round, onCancel, onConfirm }) {
  const VP = 260;
  const OUT = 480;
  const imgRef = useRef(null);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  const onImgLoad = (e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight });

  const baseScale = Math.max(VP / natural.w, VP / natural.h) || 1;
  const totalScale = baseScale * zoom;
  const dispW = natural.w * totalScale;
  const dispH = natural.h * totalScale;
  const centerX = (VP - dispW) / 2;
  const centerY = (VP - dispH) / 2;
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const left = clamp(centerX + pan.x, VP - dispW, 0);
  const top = clamp(centerY + pan.y, VP - dispH, 0);

  const onPointerDown = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };
  const onPointerUp = () => { dragRef.current = null; };

  const confirm = () => {
    const canvas = document.createElement("canvas");
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    const sx = (0 - left) / totalScale;
    const sy = (0 - top) / totalScale;
    const sSize = VP / totalScale;
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    onConfirm(canvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div className="modal-backdrop">
      <div className="modal cropper-modal">
        <div className="modal-head"><span>ปรับตำแหน่งรูป</span>
          <button className="icon-btn" onClick={onCancel}><X size={18} /></button>
        </div>
        <div
          className={`cropper-viewport ${round ? "round" : ""}`}
          style={{ width: VP, height: VP }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img ref={imgRef} src={src} onLoad={onImgLoad} draggable={false}
            style={{ position: "absolute", left, top, width: dispW, height: dispH }} alt="" />
        </div>
        <input type="range" min="1" max="3" step="0.01" value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))} className="cropper-zoom" />
        <div className="cropper-hint">ลากเพื่อเลื่อน · เลื่อนแถบเพื่อซูม</div>
        <div className="wizard-nav" style={{ marginTop: 10 }}>
          <button className="wizard-back-btn" onClick={onCancel}>ยกเลิก</button>
          <button className="wizard-next-btn" onClick={confirm}>ใช้รูปนี้</button>
        </div>
      </div>
    </div>
  );
}

function ImagePicker({ image, onChange, round, placeholderIcon, className }) {
  const fileRef = useRef(null);
  const [cropSrc, setCropSrc] = useState(null);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const dataUrl = await readFileAsDataUrl(f);
    setCropSrc(dataUrl);
  };
  return (
    <>
      <button type="button" className={className} onClick={() => fileRef.current.click()}>
        {image ? <img src={image} alt="" /> : placeholderIcon}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={pick} />
      {cropSrc && (
        <ImageCropper src={cropSrc} round={round}
          onCancel={() => setCropSrc(null)}
          onConfirm={(result) => { onChange(result); setCropSrc(null); }} />
      )}
    </>
  );
}

// ================= App =================
export default function BakeryPOS() {
  const [loaded, setLoaded] = useState(false);
  const [shop, setShop] = useState({ name: "", image: null, promptpayId: "", setupDone: false });
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);

  const [stage, setStage] = useState("onboarding");
  const [wizardStep, setWizardStep] = useState(1);

  const [view, setView] = useState("pos");
  const [activeCategory, setActiveCategory] = useState("ทั้งหมด");
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashReceived, setCashReceived] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [showPayModal, setShowPayModal] = useState(false);
  const [paidStamp, setPaidStamp] = useState(false);
  const [lastOrder, setLastOrder] = useState(null);
  const [historyDetail, setHistoryDetail] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [showToppingPicker, setShowToppingPicker] = useState(null);

  useEffect(() => {
    (async () => {
      try { await import("./storage"); } catch (e) { /* no storage.js in this environment - keep default window.storage */ }
      const s = await loadKey("bakery-shop", { name: "", image: null, promptpayId: "", setupDone: false });
      const p = await loadKey("bakery-products", []);
      const c = await loadKey("bakery-categories", []);
      const o = await loadKey("bakery-orders", []);
      setShop(s); setProducts(p); setCategories(c); setOrders(o);
      setStage(s.setupDone ? "pos" : "onboarding");
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) saveKey("bakery-shop", shop); }, [shop, loaded]);
  useEffect(() => { if (loaded) saveKey("bakery-products", products); }, [products, loaded]);
  useEffect(() => { if (loaded) saveKey("bakery-categories", categories); }, [categories, loaded]);
  useEffect(() => { if (loaded) saveKey("bakery-orders", orders); }, [orders, loaded]);

  const getEffectiveToppings = (p) => {
    const cat = categories.find((c) => c.name === p.category);
    const catToppings = (cat?.toppings || []).filter((t) => !(p.hiddenToppingIds || []).includes(t.id));
    const ownToppings = p.toppings || [];
    return [...catToppings, ...ownToppings];
  };

  const addToCart = (p) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.id === p.id);
      if (ex) return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { id: p.id, name: p.name, price: p.price, image: p.image, icon: p.icon, qty: 1 }];
    });
  };
  const selectProduct = (p) => {
    const toppings = getEffectiveToppings(p);
    if (toppings.length > 0) setShowToppingPicker({ ...p, toppings });
    else addToCart(p);
  };
  const addToCartWithToppings = (p, selectedToppings) => {
    // selectedToppings: [{id, name, price, icon, qty}] with qty > 0
    const toppingKey = selectedToppings.map((t) => `${t.id}:${t.qty}`).sort().join("-");
    const cartId = toppingKey ? `${p.id}__${toppingKey}` : p.id;
    const extra = selectedToppings.reduce((s, t) => s + t.price * t.qty, 0);
    const name = selectedToppings.length
      ? `${p.name} (+${selectedToppings.map((t) => `${t.name}${t.qty > 1 ? ` x${t.qty}` : ""}`).join(", ")})`
      : p.name;
    setCart((prev) => {
      const ex = prev.find((i) => i.id === cartId);
      if (ex) return prev.map((i) => (i.id === cartId ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { id: cartId, name, price: p.price + extra, image: p.image, icon: p.icon, qty: 1, toppings: selectedToppings }];
    });
    setShowToppingPicker(null);
  };
  const changeQty = (id, d) => setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: i.qty + d } : i)).filter((i) => i.qty > 0));
  const removeItem = (id) => setCart((prev) => prev.filter((i) => i.id !== id));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const safeDiscount = Math.min(Number(discount) || 0, subtotal);
  const total = Math.max(subtotal - safeDiscount, 0);
  const cash = Number(cashReceived) || 0;
  const change = cash - total;

  const resetSale = () => { setCart([]); setDiscount(0); setCashReceived(""); setPaymentMethod("cash"); setCustomerPhone(""); };

  const confirmPayment = () => {
    if (cart.length === 0) return;
    if (paymentMethod === "cash" && cash < total) return;
    if (paymentMethod === "pending" && !customerPhone.trim()) return;
    const order = {
      id: uid("order"), time: new Date().toISOString(), items: cart,
      subtotal, discount: safeDiscount, total, paymentMethod,
      cash: paymentMethod === "cash" ? cash : total,
      change: paymentMethod === "cash" ? change : 0,
      customerPhone: paymentMethod === "pending" ? customerPhone.trim() : "",
    };
    setOrders((prev) => [order, ...prev]);
    setLastOrder(order);
    setPaidStamp(true);
  };
  const closeReceipt = () => { setPaidStamp(false); setShowPayModal(false); setLastOrder(null); resetSale(); };
  const finalizePendingOrder = (orderId, method) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, paymentMethod: method, cash: o.total, change: 0 } : o)));
  };

  const saveProduct = (prod) => {
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === prod.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = prod; return cp; }
      return [...prev, prod];
    });
  };
  const deleteProduct = (id) => setProducts((prev) => prev.filter((p) => p.id !== id));
  const deleteOrder = (id) => setOrders((prev) => prev.filter((o) => o.id !== id));

  const saveCategory = (cat, productIds) => {
    setCategories((prev) => {
      const idx = prev.findIndex((c) => c.id === cat.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = cat; return cp; }
      return [...prev, cat];
    });
    setProducts((prev) => prev.map((p) => {
      if (productIds.includes(p.id)) return { ...p, category: cat.name };
      if (p.category === cat.name && !productIds.includes(p.id)) return { ...p, category: "" };
      return p;
    }));
  };
  const deleteCategory = (cat) => {
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    setProducts((prev) => prev.map((p) => (p.category === cat.name ? { ...p, category: "" } : p)));
  };

  const hasUncategorized = products.some((p) => !p.category);
  const posTabs = ["ทั้งหมด", ...categories.map((c) => c.name), ...(hasUncategorized ? ["ไม่ระบุหมวด"] : [])];
  const visibleProducts = products.filter((p) => {
    if (activeCategory === "ทั้งหมด") return true;
    if (activeCategory === "ไม่ระบุหมวด") return !p.category;
    return p.category === activeCategory;
  });

  const dayOrders = orders.filter((o) => o.time.slice(0, 10) === selectedDate);
  const paidDayOrders = dayOrders.filter((o) => o.paymentMethod !== "pending");
  const pendingDayOrders = dayOrders.filter((o) => o.paymentMethod === "pending");
  const daySales = paidDayOrders.reduce((s, o) => s + o.total, 0);
  const avgOrder = paidDayOrders.length ? daySales / paidDayOrders.length : 0;
  const cashTotal = paidDayOrders.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + o.total, 0);
  const transferTotal = paidDayOrders.filter((o) => o.paymentMethod === "transfer").reduce((s, o) => s + o.total, 0);
  const productTally = {};
  paidDayOrders.forEach((o) => o.items.forEach((i) => { productTally[i.name] = (productTally[i.name] || 0) + i.qty; }));
  const topProducts = Object.entries(productTally).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (!loaded) return <div className="loading-screen"><style>{css}</style>กำลังโหลด...</div>;

  if (stage === "onboarding") {
    return (
      <div className="app">
        <style>{css}</style>
        <WizardHeader shop={shop} step={wizardStep} setStep={setWizardStep}
          onClose={shop.setupDone ? () => setStage("pos") : null} />
        {wizardStep === 1 && <StepShopName shop={shop} setShop={setShop} onNext={() => setWizardStep(2)} />}
        {wizardStep === 2 && (
          <StepProducts products={products} onAdd={() => setShowAddProduct(true)}
            onEdit={(p) => setShowAddProduct(p)} onBack={() => setWizardStep(1)} onNext={() => setWizardStep(3)} />
        )}
        {wizardStep === 3 && (
          <StepCategories categories={categories} products={products}
            onAdd={() => { setEditingCategory({ id: uid("cat"), name: "" }); setShowAddCategory(true); }}
            onEdit={(c) => { setEditingCategory(c); setShowAddCategory(true); }}
            onBack={() => setWizardStep(2)} onNext={() => setWizardStep(4)} onSkip={() => setWizardStep(4)} />
        )}
        {wizardStep === 4 && (
          <StepPromptPay shop={shop} setShop={setShop} onBack={() => setWizardStep(3)}
            onFinish={() => { setShop((s) => ({ ...s, setupDone: true })); setStage("pos"); }} />
        )}
        {showAddProduct && (
          <ProductModal initial={typeof showAddProduct === "object" ? showAddProduct : null}
            categories={categories} onClose={() => setShowAddProduct(false)}
            onSave={(p) => { saveProduct(p); setShowAddProduct(false); }}
            onDelete={typeof showAddProduct === "object" ? () => { deleteProduct(showAddProduct.id); setShowAddProduct(false); } : null} />
        )}
        {showAddCategory && (
          <CategoryModal initial={editingCategory} products={products}
            onDelete={categories.find((c) => c.id === editingCategory?.id) ? () => { deleteCategory(editingCategory); setShowAddCategory(false); } : null}
            onClose={() => setShowAddCategory(false)}
            onSave={(cat, ids) => { saveCategory(cat, ids); setShowAddCategory(false); }} />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <style>{css}</style>
      <header className="topbar">
        <div className="brand">
          {shop.image ? <img src={shop.image} className="brand-photo" alt="" /> : <span className="brand-avatar-fallback">🍰</span>}
          <div>
            <div className="brand-greet">สวัสดี</div>
            <div className="brand-name">{shop.name || "ร้านของฉัน"}</div>
          </div>
        </div>
      </header>

      {view === "pos" ? (
        <div className="pos-layout">
          <section className="products-pane">
            <div className="cat-tabs">
              {posTabs.map((c) => (
                <button key={c} className={`cat-tab ${activeCategory === c ? "active" : ""}`} onClick={() => setActiveCategory(c)}>{c}</button>
              ))}
              <button className="cat-tab add-tab" onClick={() => setShowAddProduct(true)}><Plus size={14} /> เพิ่มสินค้า</button>
            </div>
            <div className="product-grid">
              {visibleProducts.length === 0 && <div className="empty-note">ยังไม่มีสินค้าในหมวดนี้</div>}
              {visibleProducts.map((p, idx) => (
                <div className="price-tag-card" key={p.id} onClick={() => selectProduct(p)} role="button" tabIndex={0}>
                  <button className="tag-edit-btn" onClick={(e) => { e.stopPropagation(); setShowAddProduct(p); }}>
                    <Edit2 size={13} />
                  </button>
                  <div className="tag-media" style={{ background: PALETTE[idx % PALETTE.length] }}>
                    {p.image ? <img src={p.image} alt={p.name} /> : <span className="tag-icon">{p.icon || "🍰"}</span>}
                  </div>
                  <div className="tag-name">{p.name}</div>
                  <div className="tag-price">฿{fmt(p.price)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="receipt-pane">
            <div className="receipt-tape">
              <div className="receipt-head">
                <div className="receipt-title">ใบสั่งซื้อ</div>
                <div className="receipt-time">{new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</div>
              </div>
              <div className="receipt-divider" />
              <div className="receipt-items">
                {cart.length === 0 && <div className="empty-note small">ยังไม่มีรายการ แตะสินค้าเพื่อเพิ่ม</div>}
                {cart.map((i) => (
                  <div className="receipt-item" key={i.id}>
                    <div className="ri-main">
                      <span className="ri-thumb">{i.image ? <img src={i.image} alt="" /> : <span>{i.icon || "🍰"}</span>}</span>
                      <span className="ri-name">{i.name}</span>
                    </div>
                    <div className="ri-controls">
                      <button className="qty-btn" onClick={() => changeQty(i.id, -1)}><Minus size={12} /></button>
                      <span className="qty-val">{i.qty}</span>
                      <button className="qty-btn" onClick={() => changeQty(i.id, 1)}><Plus size={12} /></button>
                      <span className="ri-price">฿{fmt(i.price * i.qty)}</span>
                      <button className="rm-btn" onClick={() => removeItem(i.id)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="receipt-divider" />
              <div className="receipt-row"><span>ยอดรวม</span><span>฿{fmt(subtotal)}</span></div>
              <div className="receipt-row discount-row">
                <span>ส่วนลด (บาท)</span>
                <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="discount-input" placeholder="0" />
              </div>
              <div className="receipt-row total-row"><span>สุทธิ</span><span>฿{fmt(total)}</span></div>
            </div>
            <button className="pay-btn" disabled={cart.length === 0} onClick={() => setShowPayModal(true)}>
              ชำระเงิน · ฿{fmt(total)} <ArrowRight size={16} />
            </button>
          </section>
        </div>
      ) : (
        <div className="history-layout">
          <div className="date-picker-row">
            <Calendar size={16} />
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="date-input" />
          </div>

          <div className="history-summary">
            <div className="summary-card tint-blue">
              <div className="summary-label">ยอดขาย</div>
              <div className="summary-value">฿{fmt(daySales)}</div>
            </div>
            <div className="summary-card tint-green">
              <div className="summary-label">จำนวนออเดอร์</div>
              <div className="summary-value">{paidDayOrders.length}</div>
            </div>
            <div className="summary-card tint-yellow">
              <div className="summary-label">เฉลี่ยต่อบิล</div>
              <div className="summary-value">฿{fmt(avgOrder)}</div>
            </div>
          </div>

          <div className="history-summary">
            <div className="summary-card small">
              <div className="summary-label"><Banknote size={13} /> เงินสด</div>
              <div className="summary-value small-val">฿{fmt(cashTotal)}</div>
            </div>
            <div className="summary-card small">
              <div className="summary-label"><ArrowLeftRight size={13} /> โอนเงิน</div>
              <div className="summary-value small-val">฿{fmt(transferTotal)}</div>
            </div>
            <div className="summary-card small">
              <div className="summary-label"><Clock size={13} /> รอจ่าย</div>
              <div className="summary-value small-val">{pendingDayOrders.length} รายการ</div>
            </div>
          </div>

          {topProducts.length > 0 && (
            <div className="top-products">
              <div className="top-title"><TrendingUp size={14} /> ขายดีวันนี้</div>
              {topProducts.map(([name, qty]) => (
                <div className="top-row" key={name}><span>{name}</span><span>{qty} ชิ้น</span></div>
              ))}
            </div>
          )}

          {pendingDayOrders.length > 0 && (
            <div className="top-products pending-card">
              <div className="top-title"><Clock size={14} /> รายการจอง / รอจ่าย</div>
              {pendingDayOrders.map((o) => (
                <button className="pending-row" key={o.id} onClick={() => setHistoryDetail(o)}>
                  <span>📞 {o.customerPhone || "-"}</span>
                  <span>฿{fmt(o.total)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="history-list">
            {dayOrders.length === 0 && <div className="empty-note">ไม่มีออเดอร์ในวันนี้</div>}
            {dayOrders.map((o) => (
              <button className="history-row" key={o.id} onClick={() => setHistoryDetail(o)}>
                <div className="hr-left">
                  <div className="hr-time">{new Date(o.time).toLocaleTimeString("th-TH", { timeStyle: "short" })}</div>
                  <div className="hr-items">{o.items.length} รายการ · {paymentLabel(o.paymentMethod)}</div>
                </div>
                <div className="hr-total">฿{fmt(o.total)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        <button className={`nav-item ${view === "pos" ? "active" : ""}`} onClick={() => setView("pos")}>
          <Store size={19} /><span>ขาย</span>
        </button>
        <button className={`nav-item ${view === "history" ? "active" : ""}`} onClick={() => setView("history")}>
          <History size={19} /><span>สรุป</span>
        </button>
        <button className="nav-item" onClick={() => { setStage("onboarding"); setWizardStep(1); }}>
          <Settings size={19} /><span>ตั้งค่า</span>
        </button>
      </nav>

      {showAddProduct && (
        <ProductModal initial={typeof showAddProduct === "object" ? showAddProduct : null}
          categories={categories} onClose={() => setShowAddProduct(false)}
          onSave={(p) => { saveProduct(p); setShowAddProduct(false); }}
          onDelete={typeof showAddProduct === "object" ? () => { deleteProduct(showAddProduct.id); setShowAddProduct(false); } : null} />
      )}

      {showToppingPicker && (
        <ToppingPickerModal product={showToppingPicker}
          onClose={() => setShowToppingPicker(null)}
          onConfirm={(selected) => addToCartWithToppings(showToppingPicker, selected)} />
      )}

      {showPayModal && (
        <div className="modal-backdrop" onClick={() => !paidStamp && setShowPayModal(false)}>
          <div className="modal pay-modal" onClick={(e) => e.stopPropagation()}>
            {!paidStamp ? (
              <>
                <div className="modal-head"><span>รับชำระเงิน</span>
                  <button className="icon-btn" onClick={() => setShowPayModal(false)}><X size={18} /></button>
                </div>
                <div className="pay-total">฿{fmt(total)}</div>
                <div className="method-toggle">
                  <button className={`method-btn ${paymentMethod === "cash" ? "active" : ""}`} onClick={() => setPaymentMethod("cash")}><Banknote size={16} /> เงินสด</button>
                  <button className={`method-btn ${paymentMethod === "transfer" ? "active" : ""}`} onClick={() => setPaymentMethod("transfer")}><QrCode size={16} /> สแกนจ่าย</button>
                  <button className={`method-btn ${paymentMethod === "pending" ? "active" : ""}`} onClick={() => setPaymentMethod("pending")}><Clock size={16} /> จอง/รอจ่าย</button>
                </div>
                {paymentMethod === "cash" && (
                  <>
                    <label className="field-label">รับเงินมา (บาท)</label>
                    <input className="field-input" type="number" min="0" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder="0" autoFocus />
                    <div className="change-row">
                      <span>เงินทอน</span>
                      <span className={change < 0 ? "change-negative" : "change-value"}>฿{fmt(Math.max(change, 0))}</span>
                    </div>
                  </>
                )}
                {paymentMethod === "transfer" && (
                  <QRPayBlock promptpayId={shop.promptpayId} amount={total}
                    onGoSetup={() => { setShowPayModal(false); setStage("onboarding"); setWizardStep(4); }} />
                )}
                {paymentMethod === "pending" && (
                  <>
                    <label className="field-label">เบอร์โทรลูกค้า (สำหรับติดต่อ) *</label>
                    <input className="field-input" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="เช่น 0812345678" autoFocus />
                    <div className="pending-note">ยังไม่รับเงินตอนนี้ ระบบจะเก็บไว้ในรายการ "รอจ่าย" ให้ตามทีหลัง</div>
                  </>
                )}
                <button className="confirm-btn"
                  disabled={(paymentMethod === "cash" && cash < total) || (paymentMethod === "pending" && !customerPhone.trim())}
                  onClick={confirmPayment}>
                  {paymentMethod === "pending" ? "บันทึกการจอง" : "ยืนยันการชำระเงิน"}
                </button>
              </>
            ) : (
              <div className="stamp-screen">
                <div className={`stamp-badge ${lastOrder?.paymentMethod === "pending" ? "pending" : ""}`}>
                  {lastOrder?.paymentMethod === "pending" ? <Clock size={28} strokeWidth={2.5} /> : <Check size={30} strokeWidth={3} />}
                </div>
                <div className="stamp">{lastOrder?.paymentMethod === "pending" ? "บันทึกการจองแล้ว" : "ชำระเงินสำเร็จ"}</div>
                <div className="stamp-order-total">฿{fmt(lastOrder?.total || 0)}</div>
                {lastOrder?.paymentMethod === "cash" && <div className="stamp-change">เงินทอน ฿{fmt(lastOrder.change)}</div>}
                {lastOrder?.paymentMethod === "pending" && <div className="stamp-change">📞 {lastOrder.customerPhone}</div>}
                <button className="print-btn" onClick={() => window.print()}><Printer size={16} /> พิมพ์ใบเสร็จ</button>
                <button className="confirm-btn" onClick={closeReceipt}>ออเดอร์ใหม่</button>
              </div>
            )}
          </div>
        </div>
      )}

      {historyDetail && (
        <HistoryDetailModal
          order={historyDetail}
          onClose={() => setHistoryDetail(null)}
          onDelete={() => { deleteOrder(historyDetail.id); setHistoryDetail(null); }}
          onFinalize={(method) => { finalizePendingOrder(historyDetail.id, method); setHistoryDetail(null); }}
        />
      )}

      <ReceiptPrintable shop={shop} order={paidStamp ? lastOrder : historyDetail} />
    </div>
  );
}

// ================= sub components =================

function ReceiptPrintable({ shop, order }) {
  if (!order) return null;
  return (
    <div className="print-receipt">
      <div className="pr-shop">{shop?.name || "ร้านค้า"}</div>
      <div className="pr-time">{new Date(order.time).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</div>
      <div className="pr-divider" />
      {order.items.map((i) => (
        <div className="pr-row" key={i.id}>
          <span>{i.name} x{i.qty}</span>
          <span>฿{fmt(i.price * i.qty)}</span>
        </div>
      ))}
      <div className="pr-divider" />
      <div className="pr-row"><span>ยอดรวม</span><span>฿{fmt(order.subtotal)}</span></div>
      <div className="pr-row"><span>ส่วนลด</span><span>฿{fmt(order.discount)}</span></div>
      <div className="pr-row pr-total"><span>สุทธิ</span><span>฿{fmt(order.total)}</span></div>
      <div className="pr-row"><span>ชำระโดย</span><span>{paymentLabel(order.paymentMethod)}</span></div>
      {order.paymentMethod === "cash" && (
        <>
          <div className="pr-row"><span>รับเงิน</span><span>฿{fmt(order.cash)}</span></div>
          <div className="pr-row"><span>เงินทอน</span><span>฿{fmt(order.change)}</span></div>
        </>
      )}
      {order.paymentMethod === "pending" && (
        <div className="pr-row"><span>เบอร์โทรลูกค้า</span><span>{order.customerPhone}</span></div>
      )}
      <div className="pr-thanks">ขอบคุณที่อุดหนุนค่ะ</div>
    </div>
  );
}

function WizardHeader({ shop, step, setStep, onClose }) {
  const steps = [
    { n: 1, label: shop.name || "ตั้งชื่อร้าน" },
    { n: 2, label: "สินค้า" },
    { n: 3, label: "หมวดหมู่" },
    { n: 4, label: "พร้อมเพย์" },
  ];
  return (
    <>
      <div className="wizard-topbar">
        <span>ตั้งค่าร้านค้า</span>
        {onClose && <button className="icon-btn" onClick={onClose}><X size={20} /></button>}
      </div>
      <div className="wizard-title-bar"><span>สร้างร้านของคุณ</span></div>
      <div className="stepper">
        {steps.map((s, idx) => (
          <React.Fragment key={s.n}>
            <div className="step-item" onClick={() => setStep(s.n)}>
              <div className={`step-circle ${step === s.n ? "current" : step > s.n ? "done" : ""}`}>
                {step > s.n ? <Check size={16} /> : s.n}
              </div>
              <div className="step-label">{s.label}</div>
            </div>
            {idx < steps.length - 1 && <div className={`step-line ${step > s.n ? "done" : ""}`} />}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}

function StepShopName({ shop, setShop, onNext }) {
  const [name, setName] = useState(shop.name);
  const goNext = () => {
    if (!name.trim()) return;
    setShop((s) => ({ ...s, name: name.trim() }));
    onNext();
  };
  return (
    <div className="wizard-body">
      <div className="wizard-step-head">
        <span className="wizard-step-icon"><Package size={18} /></span>
        <span className="wizard-step-title">ตั้งชื่อร้านของคุณ</span>
        <span className="wizard-step-count">ขั้นตอน 1/4</span>
      </div>
      <p className="wizard-step-desc">เริ่มเปิดร้านใน 4 ขั้นตอนง่ายๆ</p>

      <div className="shop-photo-wrap">
        <ImagePicker image={shop.image} round className="shop-photo"
          placeholderIcon={<><Camera size={22} /><span>เลือกรูปร้าน</span></>}
          onChange={(img) => setShop((s) => ({ ...s, image: img }))} />
      </div>
      <div className="photo-caption">รูปร้าน (ไม่บังคับ)</div>

      <label className="field-label big">ชื่อร้าน *</label>
      <input className="field-input big" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ร้านครัวคุณป้า เบเกอรี่" />

      <button className="wizard-next-btn" disabled={!name.trim()} onClick={goNext}>ถัดไป →</button>
    </div>
  );
}

function StepProducts({ products, onAdd, onEdit, onBack, onNext }) {
  return (
    <div className="wizard-body">
      <div className="wizard-step-head">
        <span className="wizard-step-icon"><Package size={18} /></span>
        <span className="wizard-step-title">เพิ่มสินค้า</span>
        <span className="wizard-badge">{products.length} สินค้า</span>
        <span className="wizard-step-count">ขั้นตอน 2/4</span>
      </div>
      <p className="wizard-step-desc">ใส่สินค้าอย่างน้อย 1 รายการเพื่อเริ่มขาย</p>

      <div className="wizard-list">
        <button className="wizard-list-add" onClick={onAdd}><Plus size={18} /> เพิ่มสินค้า</button>
        {products.map((p) => (
          <button className="wizard-list-row" key={p.id} onClick={() => onEdit(p)}>
            <div className="wlr-thumb">{p.image ? <img src={p.image} alt="" /> : <span>{p.icon || "🍰"}</span>}</div>
            <div className="wlr-info">
              <div className="wlr-name">{p.name}</div>
              <div className="wlr-sub">ขาย ฿{fmt(p.price)}</div>
            </div>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>

      <div className="wizard-nav">
        <button className="wizard-back-btn" onClick={onBack}><ArrowLeft size={16} /></button>
        <button className="wizard-next-btn" disabled={products.length === 0} onClick={onNext}>ถัดไป ({products.length} สินค้า) →</button>
      </div>
    </div>
  );
}

function StepCategories({ categories, products, onAdd, onEdit, onBack, onNext, onSkip }) {
  const allDone = products.length > 0 && products.every((p) => p.category);
  return (
    <div className="wizard-body">
      <div className="wizard-step-head">
        <span className="wizard-step-icon"><FolderOpen size={18} /></span>
        <span className="wizard-step-title">จัดหมวดหมู่</span>
        <span className="wizard-badge">{categories.length} หมวดหมู่</span>
        <span className="wizard-step-count">ขั้นตอน 3/4</span>
      </div>
      <p className="wizard-step-desc">ผูกสินค้าเข้าหมวด (ข้ามได้ ตั้งทีหลังได้)</p>

      <div className="wizard-list">
        <button className="wizard-list-add" onClick={onAdd}><Plus size={18} /> เพิ่มหมวดหมู่</button>
        {categories.map((c) => {
          const count = products.filter((p) => p.category === c.name).length;
          return (
            <button className="wizard-list-row" key={c.id} onClick={() => onEdit(c)}>
              <div className="wlr-thumb icon-only"><FolderOpen size={18} /></div>
              <div className="wlr-info"><div className="wlr-name">{c.name}</div></div>
              <span className="wlr-count">{count} สินค้า</span>
              <ChevronRight size={18} />
            </button>
          );
        })}
      </div>

      {allDone && categories.length > 0 && <div className="all-done-note">จัดหมวดหมู่ครบทุกสินค้าแล้ว</div>}

      <div className="wizard-nav">
        <button className="wizard-back-btn" onClick={onBack}><ArrowLeft size={16} /></button>
        <button className="wizard-next-btn" onClick={onNext}>ถัดไป →</button>
      </div>
      <button className="wizard-skip" onClick={onSkip}>ข้ามขั้นตอนนี้</button>
    </div>
  );
}

function qrProviderUrls(payload, size) {
  const data = encodeURIComponent(payload);
  return [
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${data}`,
    `https://quickchart.io/qr?text=${data}&size=${size}`,
  ];
}

function QrImage({ payload, size, alt }) {
  const urls = qrProviderUrls(payload, size);
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      key={urls[i]}
      src={urls[i]}
      alt={alt}
      style={{ width: size, height: size }}
      onError={() => { if (i < urls.length - 1) setI(i + 1); else setFailed(true); }}
    />
  );
}

function StepPromptPay({ shop, setShop, onBack, onFinish }) {
  const [id, setId] = useState(shop.promptpayId || "");
  const valid = normalizeTarget(id) !== null;
  return (
    <div className="wizard-body">
      <div className="wizard-step-head">
        <span className="wizard-step-icon"><QrCode size={18} /></span>
        <span className="wizard-step-title">ตั้งค่าพร้อมเพย์</span>
        <span className="wizard-step-count">ขั้นตอน 4/4</span>
      </div>
      <p className="wizard-step-desc">ใส่เบอร์พร้อมเพย์ หรือเลขบัตรประชาชน เพื่อสร้าง QR รับเงินตอนลูกค้าโอน</p>

      <label className="field-label big">เบอร์พร้อมเพย์ / เลขบัตรประชาชน</label>
      <input className="field-input big" value={id} onChange={(e) => setId(e.target.value)} placeholder="เช่น 0812345678" />
      {id && !valid && <div className="field-error">กรอกเบอร์โทร 10 หลัก หรือเลขบัตรประชาชน 13 หลัก</div>}
      {valid && (
        <div className="qr-preview">
          <QrImage payload={buildPromptPayPayload(id, 10)} size={180} alt="ตัวอย่าง QR" />
          <div className="qr-preview-label">ตัวอย่าง QR (ยอด 10.- บาท)</div>
        </div>
      )}

      <div className="wizard-nav">
        <button className="wizard-back-btn" onClick={onBack}><ArrowLeft size={16} /></button>
        <button className="wizard-next-btn" onClick={() => { setShop((s) => ({ ...s, promptpayId: valid ? id : "" })); onFinish(); }}>เสร็จสิ้น <Check size={16} /></button>
      </div>
      <button className="wizard-skip" onClick={() => { setShop((s) => ({ ...s, promptpayId: "" })); onFinish(); }}>ข้ามไปก่อน</button>
    </div>
  );
}

function QRPayBlock({ promptpayId, amount, onGoSetup }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  if (!promptpayId) {
    return (
      <div className="qr-missing">
        <p>ยังไม่ได้ตั้งค่าพร้อมเพย์สำหรับรับเงิน</p>
        <button className="confirm-btn" onClick={onGoSetup}>ไปตั้งค่าพร้อมเพย์</button>
      </div>
    );
  }
  const payload = buildPromptPayPayload(promptpayId, amount);
  const urls = qrProviderUrls(payload, 220);
  return (
    <div className="qr-pay-block">
      {!failed ? (
        <img
          key={attempt + urls[Math.min(attempt, urls.length - 1)]}
          src={urls[Math.min(attempt, urls.length - 1)]}
          alt="QR พร้อมเพย์"
          onError={() => { if (attempt < urls.length - 1) setAttempt(attempt + 1); else setFailed(true); }}
        />
      ) : (
        <div className="qr-fallback">
          <p>ไม่สามารถโหลด QR ได้ (อาจเป็นเพราะเน็ตช้าหรือถูกบล็อกชั่วคราว) ให้ลูกค้าโอน ฿{fmt(amount)} มาที่พร้อมเพย์ {promptpayId}</p>
          <button className="delete-btn" onClick={() => { setAttempt(0); setFailed(false); }}>ลองโหลด QR อีกครั้ง</button>
        </div>
      )}
      <div className="qr-amount">฿{fmt(amount)}</div>
      <div className="qr-caption">ให้ลูกค้าสแกนเพื่อชำระเงิน</div>
    </div>
  );
}

function ToppingsEditor({ toppings, onChange }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [tName, setTName] = useState("");
  const [tPrice, setTPrice] = useState("");
  const [tIcon, setTIcon] = useState(TOPPING_ICONS[0]);

  const resetForm = () => { setTName(""); setTPrice(""); setTIcon(TOPPING_ICONS[0]); setShowForm(false); setEditingId(null); };
  const startAdd = () => { resetForm(); setShowForm(true); };
  const startEdit = (t) => { setEditingId(t.id); setTName(t.name); setTPrice(t.price); setTIcon(t.icon); setShowForm(true); };
  const submit = () => {
    const p = Number(tPrice);
    if (!tName.trim() || !p || p <= 0) return;
    if (editingId) onChange(toppings.map((t) => (t.id === editingId ? { ...t, name: tName.trim(), price: p, icon: tIcon } : t)));
    else onChange([...toppings, { id: uid("top"), name: tName.trim(), price: p, icon: tIcon }]);
    resetForm();
  };
  const remove = (id) => onChange(toppings.filter((t) => t.id !== id));

  return (
    <>
      <div className="topping-list">
        {toppings.length === 0 && !showForm && <div className="topping-empty">ยังไม่มีท็อปปิ้ง</div>}
        {toppings.map((t) => (
          <div className="topping-row" key={t.id}>
            <button className="topping-edit-area" onClick={() => startEdit(t)}>
              <span className="topping-icon">{t.icon}</span>
              <span className="topping-name">{t.name}</span>
              <span className="topping-price">+฿{fmt(t.price)}</span>
            </button>
            <button className="topping-remove" onClick={() => remove(t.id)}><X size={14} /></button>
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="topping-form">
          <div className="topping-icon-grid">
            {TOPPING_ICONS.map((ic) => (
              <button key={ic} className={`icon-choice ${tIcon === ic ? "active" : ""}`} onClick={() => setTIcon(ic)}>{ic}</button>
            ))}
          </div>
          <input className="field-input" value={tName} onChange={(e) => setTName(e.target.value)} placeholder="ชื่อท็อปปิ้ง เช่น สตรอเบอร์รี่" />
          <input className="field-input" type="number" min="0" value={tPrice} onChange={(e) => setTPrice(e.target.value)} placeholder="ราคาเพิ่ม" />
          <div className="topping-form-actions">
            <button className="wizard-back-btn" onClick={resetForm}>ยกเลิก</button>
            <button className="wizard-next-btn" onClick={submit}>{editingId ? "บันทึก" : "เพิ่ม"}</button>
          </div>
        </div>
      ) : (
        <button className="topping-add-btn" onClick={startAdd}><Plus size={16} /> เพิ่มท็อปปิ้ง</button>
      )}
    </>
  );
}

function ProductModal({ initial, categories, onClose, onSave, onDelete }) {
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial?.price || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [icon, setIcon] = useState(initial?.icon || "🍰");
  const [image, setImage] = useState(initial?.image || null);
  const [toppings, setToppings] = useState(initial?.toppings || []);
  const [hiddenToppingIds, setHiddenToppingIds] = useState(initial?.hiddenToppingIds || []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    const p = Number(price);
    if (!name.trim() || !p || p <= 0) return;
    onSave({ id: initial?.id || uid("p"), name: name.trim(), price: p, category, icon, image, toppings, hiddenToppingIds });
  };

  const categoryToppings = categories.find((c) => c.name === category)?.toppings || [];
  const toggleHidden = (id) => setHiddenToppingIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><span>{initial ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="product-image-row">
          <ImagePicker image={image} className="product-image-pick"
            placeholderIcon={<><span className="qmark">?</span><span className="pick-label">เลือกรูป</span></>}
            onChange={setImage} />
          <div className="icon-fallback-note">ถ้าไม่ใส่รูป จะใช้ไอคอนแทน</div>
        </div>

        <label className="field-label">ชื่อสินค้า *</label>
        <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น กาแฟเย็น" />

        <label className="field-label">ราคาขาย *</label>
        <input className="field-input" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />

        <label className="field-label">หมวดหมู่</label>
        <select className="field-input" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">ยังไม่ระบุ</option>
          {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>

        {!image && (
          <>
            <label className="field-label">ไอคอน (ใช้แทนรูป)</label>
            <div className="icon-grid">
              {ICON_CHOICES.map((ic) => (
                <button key={ic} className={`icon-choice ${icon === ic ? "active" : ""}`} onClick={() => setIcon(ic)}>{ic}</button>
              ))}
            </div>
          </>
        )}

        {categoryToppings.length > 0 && (
          <>
            <label className="field-label">ท็อปปิ้งจากหมวดหมู่ "{category}"</label>
            <div className="topping-inherit-note">ติ๊กออกได้ถ้าไม่อยากให้สินค้านี้มีท็อปปิ้งอันไหนเป็นพิเศษ</div>
            <div className="topping-list">
              {categoryToppings.map((t) => {
                const hidden = hiddenToppingIds.includes(t.id);
                return (
                  <label className="topping-row topping-row-checkable" key={t.id}>
                    <input type="checkbox" checked={!hidden} onChange={() => toggleHidden(t.id)} />
                    <span className="topping-icon">{t.icon}</span>
                    <span className="topping-name">{t.name}</span>
                    <span className="topping-price">+฿{fmt(t.price)}</span>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <label className="field-label">ท็อปปิ้งเพิ่มเติมเฉพาะสินค้านี้ (ไม่บังคับ)</label>
        <ToppingsEditor toppings={toppings} onChange={setToppings} />

        <button className="confirm-btn" onClick={save}>บันทึกสินค้า</button>
        {onDelete && (
          confirmDelete ? (
            <div className="confirm-delete-row">
              <span>ลบสินค้านี้แน่ใจนะ?</span>
              <div className="confirm-delete-actions">
                <button className="wizard-back-btn" onClick={() => setConfirmDelete(false)}>ยกเลิก</button>
                <button className="delete-btn-confirm" onClick={onDelete}>ยืนยันลบ</button>
              </div>
            </div>
          ) : (
            <button className="delete-btn" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> ลบสินค้านี้</button>
          )
        )}
      </div>
    </div>
  );
}

function ToppingPickerModal({ product, onClose, onConfirm }) {
  const [qtyMap, setQtyMap] = useState({});
  const changeQty = (t, delta) => {
    setQtyMap((prev) => {
      const next = Math.max(0, (prev[t.id] || 0) + delta);
      return { ...prev, [t.id]: next };
    });
  };
  const selected = product.toppings
    .map((t) => ({ ...t, qty: qtyMap[t.id] || 0 }))
    .filter((t) => t.qty > 0);
  const total = product.price + selected.reduce((s, t) => s + t.price * t.qty, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><span>{product.name}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="field-label">เลือกท็อปปิ้ง (แตะ + เพื่อเพิ่มจำนวนได้)</label>
        <div className="topping-pick-list">
          {product.toppings.map((t) => {
            const qty = qtyMap[t.id] || 0;
            return (
              <div className="topping-pick-row" key={t.id}>
                <span className="topping-icon">{t.icon}</span>
                <span className="topping-name">{t.name}</span>
                <span className="topping-price">+฿{fmt(t.price)}</span>
                <div className="topping-qty-controls">
                  <button className="qty-btn" onClick={() => changeQty(t, -1)} disabled={qty === 0}><Minus size={12} /></button>
                  <span className="qty-val">{qty}</span>
                  <button className="qty-btn" onClick={() => changeQty(t, 1)}><Plus size={12} /></button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="topping-total-row"><span>ราคารวม</span><span>฿{fmt(total)}</span></div>
        <button className="confirm-btn" onClick={() => onConfirm(selected)}>เพิ่มลงตะกร้า</button>
      </div>
    </div>
  );
}

function HistoryDetailModal({ order, onClose, onDelete, onFinalize }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><span>รายละเอียดออเดอร์</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="detail-time">{new Date(order.time).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</div>
        {order.items.map((i) => (
          <div className="receipt-row" key={i.id}><span>{i.icon || "🍰"} {i.name} x{i.qty}</span><span>฿{fmt(i.price * i.qty)}</span></div>
        ))}
        <div className="receipt-divider" />
        <div className="receipt-row"><span>ยอดรวม</span><span>฿{fmt(order.subtotal)}</span></div>
        <div className="receipt-row"><span>ส่วนลด</span><span>฿{fmt(order.discount)}</span></div>
        <div className="receipt-row total-row"><span>สุทธิ</span><span>฿{fmt(order.total)}</span></div>
        <div className="receipt-row"><span>ชำระโดย</span><span>{paymentLabel(order.paymentMethod)}</span></div>
        {order.paymentMethod === "pending" && (
          <div className="receipt-row"><span>เบอร์โทรลูกค้า</span><span>📞 {order.customerPhone || "-"}</span></div>
        )}
        <button className="print-btn" onClick={() => window.print()}><Printer size={16} /> พิมพ์ใบเสร็จ</button>

        {order.paymentMethod === "pending" && onFinalize && (
          <div className="finalize-block">
            <div className="finalize-label">ลูกค้าจ่ายแล้ว รับด้วยวิธีไหน?</div>
            <div className="finalize-actions">
              <button className="wizard-back-btn finalize-btn" onClick={() => onFinalize("cash")}><Banknote size={14} /> เงินสด</button>
              <button className="wizard-back-btn finalize-btn" onClick={() => onFinalize("transfer")}><QrCode size={14} /> โอนเงิน</button>
            </div>
          </div>
        )}

        {confirmDelete ? (
          <div className="confirm-delete-row">
            <span>ลบรายการขายนี้แน่ใจนะ? (แก้คืนไม่ได้)</span>
            <div className="confirm-delete-actions">
              <button className="wizard-back-btn" onClick={() => setConfirmDelete(false)}>ยกเลิก</button>
              <button className="delete-btn-confirm" onClick={onDelete}>ยืนยันลบ</button>
            </div>
          </div>
        ) : (
          <button className="delete-btn" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> ลบรายการขายนี้</button>
        )}
      </div>
    </div>
  );
}

function CategoryModal({ initial, products, onClose, onSave, onDelete }) {
  const [name, setName] = useState(initial?.name || "");
  const [toppings, setToppings] = useState(initial?.toppings || []);
  const [selected, setSelected] = useState(products.filter((p) => p.category === initial?.name).map((p) => p.id));
  const toggle = (id) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const save = () => { if (!name.trim()) return; onSave({ id: initial.id, name: name.trim(), toppings }, selected); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><span>{initial?.name ? "แก้ไขหมวดหมู่" : "เพิ่มหมวดหมู่"}</span>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="field-label">ชื่อหมวดหมู่ *</label>
        <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น เค้ก" />

        <label className="field-label">ท็อปปิ้งของหมวดนี้ (ไม่บังคับ)</label>
        <div className="topping-inherit-note">ถ้าตั้งไว้ที่นี่ สินค้าทุกตัวในหมวดนี้จะมีตัวเลือกท็อปปิ้งชุดเดียวกันหมด</div>
        <ToppingsEditor toppings={toppings} onChange={setToppings} />

        <label className="field-label">เลือกสินค้าในหมวดนี้</label>
        <div className="product-check-list">
          {products.length === 0 && <div className="empty-note small">ยังไม่มีสินค้า</div>}
          {products.map((p) => (
            <label className="product-check-row" key={p.id}>
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
              <div className="wlr-thumb small">{p.image ? <img src={p.image} alt="" /> : <span>{p.icon || "🍰"}</span>}</div>
              <span>{p.name}</span>
            </label>
          ))}
        </div>

        <button className="confirm-btn" onClick={save}>บันทึกหมวดหมู่</button>
        {onDelete && <button className="delete-btn" onClick={onDelete}><Trash2 size={14} /> ลบหมวดหมู่นี้</button>}
      </div>
    </div>
  );
}

// ================= styles =================
const css = `
@import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');

:root {
  --bg: #FFFFFF;
  --surface: #F3F4F8;
  --card: #FFFFFF;
  --ink: #2B2D42;
  --ink-soft: #9498B3;
  --blue: #BFE3F0;
  --blue-deep: #3E93B8;
  --green: #C9EFCB;
  --green-deep: #F0973E;
  --yellow: #F7DB4D;
  --yellow-deep: #FCEB53;
  --peach: #F7D6C4;
  --peach-deep: #E8935A;
  --line: #EDEFF6;
  --shadow: 0 10px 26px rgba(43,45,66,0.07);

  /* legacy aliases kept so nothing else in the file breaks */
  --paper: var(--bg);
  --paper-deep: var(--yellow);
  --cocoa: var(--ink);
  --cocoa-soft: var(--ink-soft);
  --cherry: var(--yellow-deep);
  --cherry-deep: var(--peach-deep);
  --mint: var(--green-deep);
}
* { box-sizing: border-box; }
.loading-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; font-family:'Prompt'; color:var(--ink-soft); background:var(--bg); }
.app {
  min-height: 100vh; background: var(--bg); color: var(--ink); font-family: 'Prompt', sans-serif;
  display: flex; flex-direction: column; position: relative;
  padding-bottom: 92px;
}

.topbar { display:flex; align-items:center; justify-content:space-between; padding:22px 20px 6px; background:transparent; color:var(--ink); flex-wrap:wrap; gap:8px; }
.brand { display:flex; align-items:center; gap:12px; }
.brand-avatar-fallback { width:46px; height:46px; border-radius:50%; background:var(--yellow); display:flex; align-items:center; justify-content:center; font-size:22px; }
.brand-photo { width:46px; height:46px; border-radius:50%; object-fit:cover; box-shadow: var(--shadow); }
.brand-greet { font-size:12.5px; color:var(--ink-soft); }
.brand-name { font-family:'Prompt', sans-serif; font-weight:700; font-size:18px; color:var(--ink); }

.pos-layout { display:flex; flex:1; min-height:0; flex-wrap: wrap; }
.products-pane { flex:1.5; min-width:280px; padding:16px 16px 8px; overflow-y:auto; }
.cat-tabs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; }
.cat-tab { border:none; background:var(--card); color:var(--ink-soft); padding:9px 18px; border-radius:999px; font-family:'Prompt'; font-weight:500; font-size:13.5px; cursor:pointer; box-shadow: var(--shadow); }
.cat-tab.active { background:var(--yellow-deep); color:var(--ink); font-weight:600; }
.add-tab { display:flex; align-items:center; gap:4px; color:var(--peach-deep); margin-left:auto; }

.product-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(148px, 1fr)); gap:16px 14px; }
.price-tag-card { position:relative; background:var(--card); border:none; border-radius:22px; padding:14px 14px 16px; text-align:left; cursor:pointer; transition:transform .15s, box-shadow .15s; box-shadow: var(--shadow); }
.price-tag-card:hover { transform:translateY(-3px); box-shadow: 0 14px 30px rgba(43,45,66,0.12); }
.tag-media { width:100%; aspect-ratio:1; border-radius:16px; margin-bottom:10px; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.tag-media img { width:100%; height:100%; object-fit:cover; }
.tag-icon { font-size:34px; }
.tag-name { font-size:13.5px; font-weight:600; margin-bottom:4px; line-height:1.3; color:var(--ink); }
.tag-price { font-family:'Prompt'; font-weight:700; color:var(--peach-deep); font-size:15px; }

.empty-note { color:var(--ink-soft); font-size:13px; padding:20px; text-align:center; grid-column:1/-1; }
.empty-note.small { padding:14px 0; }

.receipt-pane { flex:1; min-width:300px; max-width:380px; padding:16px; display:flex; flex-direction:column; gap:14px; }
.receipt-tape { background:var(--card); border:none; border-radius:22px; padding:20px; font-family:'Prompt'; box-shadow: var(--shadow); display:flex; flex-direction:column; }
.receipt-head { display:flex; justify-content:space-between; align-items:baseline; }
.receipt-title { font-family:'Prompt'; font-weight:700; font-size:16px; }
.receipt-time { font-size:11px; color:var(--ink-soft); }
.receipt-divider { border-top:1.5px solid var(--line); margin:12px 0; }
.receipt-items { max-height:260px; overflow-y:auto; min-height:40px; }
.receipt-item { display:flex; flex-direction:column; gap:6px; padding:8px 0; }
.ri-main { display:flex; align-items:center; gap:10px; font-size:13.5px; }
.ri-thumb { width:34px; height:34px; border-radius:11px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:var(--surface); flex-shrink:0; }
.ri-thumb img { width:100%; height:100%; object-fit:cover; }
.ri-name { font-weight:500; }
.ri-controls { display:flex; align-items:center; gap:8px; }
.qty-btn { width:22px; height:22px; border-radius:50%; border:none; background:var(--surface); color:var(--ink); display:flex; align-items:center; justify-content:center; cursor:pointer; }
.qty-val { font-variant-numeric:tabular-nums; min-width:16px; text-align:center; font-size:13px; font-weight:600; }
.ri-price { margin-left:auto; font-variant-numeric:tabular-nums; font-weight:700; font-size:13px; }
.rm-btn { background:none; border:none; color:var(--peach-deep); opacity:0.55; cursor:pointer; }
.rm-btn:hover { opacity:1; }

.receipt-row { display:flex; justify-content:space-between; align-items:center; font-size:13.5px; padding:5px 0; font-variant-numeric:tabular-nums; }
.discount-row .discount-input { width:90px; text-align:right; border:1px solid var(--line); border-radius:8px; padding:5px 10px; font-family:'Prompt'; font-size:13px; background:var(--surface); }
.total-row { font-weight:700; font-size:18px; color:var(--peach-deep); padding-top:8px; }
.pay-btn { display:flex; align-items:center; justify-content:center; gap:8px; background:var(--yellow-deep); color:var(--ink); border:none; border-radius:999px; padding:16px; font-family:'Prompt'; font-weight:600; font-size:15px; cursor:pointer; box-shadow: var(--shadow); }
.pay-btn:disabled { opacity:0.4; cursor:not-allowed; }
.pay-btn:not(:disabled):hover { background:var(--peach-deep); }

.history-layout { padding:20px; padding-bottom:8px; max-width:640px; margin:0 auto; width:100%; }
.date-picker-row { display:flex; align-items:center; gap:8px; margin-bottom:16px; color:var(--ink-soft); }
.date-input { border:none; border-radius:10px; padding:8px 12px; font-family:'Prompt'; background:var(--card); box-shadow: var(--shadow); }
.history-summary { display:flex; gap:14px; margin-bottom:14px; }
.summary-card { background:var(--card); border:none; border-radius:20px; padding:18px; flex:1; box-shadow: var(--shadow); }
.summary-card.tint-blue { background: var(--blue); }
.summary-card.tint-green { background: var(--green); }
.summary-card.tint-yellow { background: var(--yellow); }
.summary-card.small { padding:12px 16px; }
.summary-label { font-size:12px; color:var(--ink-soft); margin-bottom:6px; display:flex; align-items:center; gap:5px; }
.summary-card.tint-blue .summary-label, .summary-card.tint-green .summary-label, .summary-card.tint-yellow .summary-label { color: rgba(43,45,66,0.65); }
.summary-value { font-family:'Prompt'; font-weight:700; font-size:22px; color:var(--ink); }
.summary-value.small-val { font-size:16px; font-family:'Prompt'; font-weight:700; color:var(--ink); }
.top-products { background:var(--card); border:none; border-radius:20px; padding:16px 18px; margin-bottom:14px; font-family:'Prompt'; box-shadow: var(--shadow); }
.pending-card { border:1.5px dashed var(--yellow-deep); }
.pending-row { width:100%; display:flex; justify-content:space-between; background:none; border:none; border-top:1px solid var(--line); padding:8px 0; cursor:pointer; font-family:'Prompt'; font-size:13px; color:var(--ink); }
.pending-row:first-of-type { border-top:none; }
.finalize-block { margin-top:12px; background:var(--yellow); border-radius:14px; padding:12px; }
.finalize-label { font-size:12.5px; color:var(--ink); font-family:'Prompt'; margin-bottom:8px; text-align:center; }
.finalize-actions { display:flex; gap:8px; }
.finalize-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; background:white; }
.top-title { display:flex; align-items:center; gap:6px; font-weight:600; margin-bottom:8px; font-size:13.5px; }
.top-row { display:flex; justify-content:space-between; font-size:13px; padding:4px 0; color:var(--ink-soft); }
.history-list { display:flex; flex-direction:column; gap:10px; }
.history-row { display:flex; justify-content:space-between; align-items:center; background:var(--card); border:none; border-radius:18px; padding:14px 18px; cursor:pointer; font-family:'Prompt'; text-align:left; box-shadow: var(--shadow); }
.hr-time { font-size:13px; font-weight:600; }
.hr-items { font-size:11.5px; color:var(--ink-soft); }
.hr-total { font-weight:700; color:var(--peach-deep); font-variant-numeric:tabular-nums; }

.bottom-nav { position:fixed; left:50%; bottom:18px; transform:translateX(-50%); display:flex; gap:6px; background:var(--card); border-radius:999px; padding:8px; box-shadow: 0 14px 34px rgba(43,45,66,0.16); z-index:40; }
.nav-item { display:flex; flex-direction:column; align-items:center; gap:2px; border:none; background:transparent; color:var(--ink-soft); padding:9px 18px; border-radius:999px; font-family:'Prompt'; font-size:10.5px; cursor:pointer; }
.nav-item.active { background:var(--yellow); color:var(--ink); font-weight:600; }

.modal-backdrop { position:fixed; inset:0; background:rgba(43,45,66,0.35); display:flex; align-items:center; justify-content:center; z-index:50; padding:16px; }
.modal { background:var(--surface); border-radius:24px; padding:24px; width:100%; max-width:380px; max-height:88vh; overflow-y:auto; box-shadow: 0 20px 50px rgba(43,45,66,0.2); }
.modal-head { display:flex; justify-content:space-between; align-items:center; font-family:'Prompt'; font-weight:700; font-size:17px; margin-bottom:16px; }
.icon-btn { background:var(--card); border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:none; cursor:pointer; color:var(--ink); }
.field-label { display:block; font-size:12px; color:var(--ink-soft); margin:10px 0 5px; }
.field-label.big { font-size:14px; margin-top:18px; }
.field-input { width:100%; border:1px solid var(--line); border-radius:12px; padding:11px 14px; font-family:'Prompt'; font-size:14px; background:var(--card); }
.field-input.big { padding:15px; font-size:16px; }
.field-error { color:var(--peach-deep); font-size:12px; margin-top:6px; }
.icon-grid { display:grid; grid-template-columns:repeat(8, 1fr); gap:6px; margin-top:6px; }

.topping-list { margin-top:6px; }
.topping-empty { color:var(--ink-soft); font-size:12.5px; padding:6px 0; }
.topping-row { display:flex; align-items:center; gap:8px; background:var(--card); border-radius:12px; padding:4px 6px 4px 12px; margin-bottom:6px; box-shadow: var(--shadow); }
.topping-edit-area { flex:1; display:flex; align-items:center; gap:8px; background:none; border:none; padding:6px 4px; cursor:pointer; text-align:left; }
.topping-icon { font-size:16px; }
.topping-name { flex:1; font-size:13.5px; font-weight:500; }
.topping-price { font-size:13px; color:var(--peach-deep); font-weight:600; }
.topping-remove { background:none; border:none; color:var(--ink-soft); cursor:pointer; display:flex; padding:8px; }
.topping-add-btn { width:100%; margin-top:6px; background:var(--card); border:1.5px dashed var(--line); color:var(--peach-deep); border-radius:12px; padding:10px; font-family:'Prompt'; font-size:13.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; }
.topping-form { background:var(--card); border-radius:14px; padding:12px; margin-top:6px; box-shadow: var(--shadow); }
.topping-icon-grid { display:grid; grid-template-columns:repeat(7, 1fr); gap:6px; margin-bottom:8px; }
.topping-form input { margin-bottom:8px; }
.topping-form-actions { display:flex; gap:8px; }
.topping-pick-list { max-height:320px; overflow-y:auto; margin-top:6px; }
.topping-pick-row { display:flex; align-items:center; gap:10px; background:var(--card); border-radius:12px; padding:10px 12px; margin-bottom:6px; box-shadow: var(--shadow); font-family:'Prompt'; }
.topping-qty-controls { display:flex; align-items:center; gap:8px; }
.topping-qty-controls .qty-btn:disabled { opacity:0.3; cursor:not-allowed; }
.topping-total-row { display:flex; justify-content:space-between; font-weight:700; font-size:16px; margin-top:14px; color:var(--peach-deep); }
.topping-inherit-note { font-size:12px; color:var(--ink-soft); background:var(--yellow); border-radius:10px; padding:8px 12px; margin:4px 0 8px; font-family:'Prompt'; }
.topping-row-checkable { cursor:pointer; font-family:'Prompt'; }
.topping-row-checkable input[type="checkbox"] { flex-shrink:0; }

.icon-choice { border:1.5px solid var(--line); background:var(--card); border-radius:10px; padding:6px 0; font-size:17px; cursor:pointer; }
.icon-choice.active { border-color:var(--yellow-deep); background:var(--yellow); }
.confirm-btn { width:100%; margin-top:18px; background:var(--yellow-deep); color:var(--ink); border:none; border-radius:999px; padding:13px; font-family:'Prompt'; font-weight:600; font-size:14.5px; cursor:pointer; }
.confirm-btn:disabled { opacity:0.4; cursor:not-allowed; }
.delete-btn { width:100%; margin-top:10px; background:none; border:1px solid var(--line); color:var(--peach-deep); border-radius:999px; padding:10px; font-family:'Prompt'; font-size:13.5px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; }
.tag-edit-btn { position:absolute; top:8px; right:8px; width:26px; height:26px; border-radius:50%; background:rgba(255,255,255,0.9); border:none; display:flex; align-items:center; justify-content:center; color:var(--ink-soft); box-shadow: var(--shadow); cursor:pointer; z-index:2; }
.tag-edit-btn:hover { color:var(--yellow-deep); }
.confirm-delete-row { margin-top:10px; background:#FDEEEE; border-radius:14px; padding:12px; text-align:center; font-family:'Prompt'; font-size:13px; color:#B23B3B; }
.confirm-delete-actions { display:flex; gap:8px; margin-top:10px; }
.delete-btn-confirm { flex:1; background:#D64545; color:white; border:none; border-radius:999px; padding:10px; font-family:'Prompt'; font-weight:600; font-size:13.5px; cursor:pointer; }

.pay-modal { max-width:340px; }
.pay-total { font-family:'Prompt'; font-weight:700; font-size:32px; text-align:center; color:var(--ink); margin-bottom:16px; }
.method-toggle { display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
.method-btn { flex:1; min-width:88px; display:flex; align-items:center; justify-content:center; gap:6px; border:none; background:var(--card); border-radius:14px; padding:11px; cursor:pointer; font-family:'Prompt'; font-weight:500; font-size:12.5px; color:var(--ink-soft); }
.method-btn.active { background:var(--yellow); color:var(--ink); font-weight:600; }
.change-row { display:flex; justify-content:space-between; align-items:center; margin-top:14px; font-family:'Prompt'; font-size:14px; font-weight:600; }
.change-value { color:var(--green-deep); font-size:19px; }
.change-negative { color:var(--peach-deep); font-size:19px; }
.pending-note { font-size:12px; color:var(--ink-soft); background:var(--yellow); border-radius:10px; padding:8px 12px; margin-top:10px; font-family:'Prompt'; }

.qr-pay-block { display:flex; flex-direction:column; align-items:center; margin-top:10px; padding:16px; background:var(--card); border-radius:20px; }
.qr-pay-block img { width:180px; height:180px; border-radius:12px; }
.qr-amount { font-family:'Prompt'; font-weight:700; font-size:20px; color:var(--ink); margin-top:10px; }
.qr-caption { font-size:12px; color:var(--ink-soft); margin-top:2px; }
.qr-fallback { font-size:13px; text-align:center; color:var(--ink-soft); padding:20px; }
.qr-missing { text-align:center; font-size:13px; color:var(--ink-soft); padding:10px 0; }

.stamp-screen { display:flex; flex-direction:column; align-items:center; padding:14px 0 4px; }
.stamp-badge { width:64px; height:64px; border-radius:50%; background:var(--green-deep); color:white; display:flex; align-items:center; justify-content:center; margin-bottom:14px; animation:stampIn .35s cubic-bezier(.2,1.4,.4,1); }
.stamp-badge.pending { background:var(--yellow-deep); }
.stamp { font-family:'Prompt'; font-weight:600; font-size:16px; color:var(--ink); margin-bottom:10px; }
@keyframes stampIn { 0%{transform:scale(0.4); opacity:0;} 100%{transform:scale(1); opacity:1;} }
.stamp-order-total { font-family:'Prompt'; font-size:26px; font-weight:700; margin-bottom:4px; color:var(--ink); }
.stamp-change { font-family:'Prompt'; font-size:13px; color:var(--ink-soft); margin-bottom:14px; }
.detail-time { font-size:12px; color:var(--ink-soft); margin-bottom:10px; font-family:'Prompt'; }

.wizard-topbar { display:flex; justify-content:space-between; align-items:center; padding:18px 20px; font-family:'Prompt'; font-weight:600; background:transparent; color: var(--ink); }
.wizard-title-bar { background:transparent; color:var(--ink); text-align:center; padding:6px 16px 18px; font-family:'Prompt'; font-weight:700; font-size:20px; }
.stepper { display:flex; align-items:center; background:var(--card); margin:0 16px; border-radius:20px; padding:18px 16px 14px; box-shadow: var(--shadow); }
.step-item { display:flex; flex-direction:column; align-items:center; gap:6px; cursor:pointer; flex:1; }
.step-circle { width:38px; height:38px; border-radius:50%; background:var(--surface); color:var(--ink-soft); display:flex; align-items:center; justify-content:center; font-weight:700; font-family:'Prompt'; }
.step-circle.current { background:var(--yellow-deep); color:var(--ink); }
.step-circle.done { background:var(--green-deep); color:white; }
.step-label { color:var(--ink-soft); font-size:11px; text-align:center; }
.step-line { flex:0.6; height:2px; background:var(--line); margin-bottom:22px; }
.step-line.done { background:var(--green-deep); }

.wizard-body { padding:22px; max-width:640px; margin:0 auto; width:100%; }
.wizard-step-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-family:'Prompt'; font-weight:700; font-size:19px; margin-bottom:4px; }
.wizard-step-icon { background:var(--yellow); border-radius:12px; padding:8px; display:flex; color: var(--ink); }
.wizard-badge { background:var(--yellow); color:var(--ink); font-family:'Prompt'; font-weight:600; font-size:12px; padding:4px 12px; border-radius:999px; }
.wizard-step-count { margin-left:auto; font-family:'Prompt'; font-size:12px; color:var(--ink-soft); }
.wizard-step-desc { font-family:'Prompt'; color:var(--ink-soft); font-size:13.5px; margin:6px 0 20px; }

.shop-photo-wrap { display:flex; justify-content:center; margin-bottom:6px; }
.shop-photo { width:120px; height:120px; border-radius:50%; border:none; background:var(--card); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; color:var(--ink-soft); font-family:'Prompt'; font-size:11px; cursor:pointer; overflow:hidden; padding:0; box-shadow: var(--shadow); }
.shop-photo img { width:100%; height:100%; object-fit:cover; }
.photo-caption { text-align:center; font-family:'Prompt'; font-size:12px; color:var(--ink-soft); margin-bottom:10px; }

.wizard-list { background:var(--card); border:none; border-radius:20px; overflow:hidden; margin-bottom:16px; box-shadow: var(--shadow); }
.wizard-list-add { width:100%; display:flex; align-items:center; gap:10px; padding:16px; border:none; background:none; border-bottom:1px solid var(--line); color:var(--peach-deep); font-family:'Prompt'; font-weight:500; font-size:14.5px; cursor:pointer; }
.wizard-list-row { width:100%; display:flex; align-items:center; gap:12px; padding:14px 16px; border:none; background:none; border-bottom:1px solid var(--line); cursor:pointer; text-align:left; font-family:'Prompt'; }
.wizard-list-row:last-child { border-bottom:none; }
.wlr-thumb { width:42px; height:42px; border-radius:12px; background:var(--surface); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0; font-size:19px; }
.wlr-thumb.small { width:30px; height:30px; font-size:15px; border-radius:8px; }
.wlr-thumb img { width:100%; height:100%; object-fit:cover; }
.wlr-thumb.icon-only { color:var(--ink-soft); }
.wlr-info { flex:1; }
.wlr-name { font-weight:600; font-size:14.5px; }
.wlr-sub { font-size:12px; color:var(--ink-soft); }
.wlr-count { font-size:12px; color:var(--ink-soft); }

.all-done-note { text-align:center; color:var(--green-deep); font-family:'Prompt'; font-weight:500; font-size:13.5px; margin-bottom:14px; }

.wizard-nav { display:flex; gap:10px; }
.wizard-back-btn { border:none; background:var(--card); border-radius:999px; padding:0 18px; cursor:pointer; box-shadow: var(--shadow); color: var(--ink); }
.wizard-next-btn { flex:1; background:var(--yellow-deep); color:var(--ink); border:none; border-radius:999px; padding:15px; font-family:'Prompt'; font-weight:600; font-size:15px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; }
.wizard-next-btn:disabled { opacity:0.4; cursor:not-allowed; }
.wizard-skip { display:block; margin:12px auto 0; background:none; border:none; color:var(--ink-soft); font-family:'Prompt'; font-size:13px; text-decoration:underline; cursor:pointer; }

.product-image-row { display:flex; flex-direction:column; align-items:center; gap:6px; margin-bottom:6px; }
.product-image-pick { width:112px; height:112px; border-radius:20px; border:none; background:var(--card); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; color:var(--ink-soft); cursor:pointer; overflow:hidden; padding:0; box-shadow: var(--shadow); }
.product-image-pick img { width:100%; height:100%; object-fit:cover; }
.qmark { font-size:22px; }
.pick-label { font-size:11px; }
.icon-fallback-note { font-size:11px; color:var(--ink-soft); font-family:'Prompt'; }

.qr-preview { display:flex; flex-direction:column; align-items:center; margin-top:14px; padding:16px; background:var(--card); border-radius:20px; }
.qr-preview img { width:150px; height:150px; border-radius:10px; }
.qr-preview-label { font-size:11.5px; color:var(--ink-soft); margin-top:6px; font-family:'Prompt'; }

.product-check-list { max-height:220px; overflow-y:auto; border-radius:14px; margin-top:6px; background:var(--card); }
.product-check-row { display:flex; align-items:center; gap:10px; padding:10px 12px; border-bottom:1px solid var(--line); font-family:'Prompt'; font-size:13.5px; }
.product-check-row:last-child { border-bottom:none; }

.cropper-modal { max-width:300px; }
.cropper-viewport { position:relative; overflow:hidden; margin:0 auto; background:#222; border-radius:16px; touch-action:none; cursor:grab; }
.cropper-viewport.round { border-radius:50%; }
.cropper-viewport img { touch-action:none; }
.cropper-zoom { width:100%; margin-top:14px; accent-color: var(--yellow-deep); }
.cropper-hint { text-align:center; font-size:11.5px; color:var(--ink-soft); font-family:'Prompt'; margin-top:4px; }

.print-btn {
  width:100%; margin-top:12px; background:white; border:1.5px solid var(--line); color:var(--ink);
  border-radius:999px; padding:11px; font-family:'Prompt'; font-weight:500; font-size:13.5px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; gap:8px;
}
.print-btn:hover { border-color: var(--yellow-deep); }

.print-receipt { display: none; }
@media print {
  body * { visibility: hidden; }
  .print-receipt, .print-receipt * { visibility: visible; }
  .print-receipt {
    display: block !important; position: absolute; left: 0; top: 0; width: 100%;
    padding: 16px; font-family: 'Prompt', sans-serif; color: #111;
  }
  .pr-shop { font-weight:700; font-size:18px; text-align:center; margin-bottom:2px; }
  .pr-time { font-size:12px; text-align:center; color:#555; margin-bottom:10px; }
  .pr-divider { border-top:1px dashed #999; margin:8px 0; }
  .pr-row { display:flex; justify-content:space-between; font-size:13px; padding:2px 0; }
  .pr-total { font-weight:700; font-size:15px; }
  .pr-thanks { text-align:center; margin-top:16px; font-size:12px; }
}

@media (max-width:760px) {
  .pos-layout { flex-direction:column; }
  .receipt-pane { max-width:100%; }
}
`;
