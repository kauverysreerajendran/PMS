import { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import {
  BedDouble, Building2, CalendarCheck, CalendarDays, CalendarPlus, ChevronDown, ChevronUp, Clock, CreditCard, DoorOpen,
  FileText, IndianRupee, Leaf, LoaderCircle, MessageSquare, Moon, Percent, Receipt, Tag, User, UserRound, Wallet, X,
} from "lucide-react";
import { AvailableRoomType, GuestSearchResult, PaymentMethodOption, RatePlanOption, Reservation, ReservationInput } from "./reservationsApi";
import "./reservationForm.css";

export type GroupBlock = { room_category: string; rate_plan: string; rooms_count: number; adults: number; children: number; nightly_rate: number };

type Props = {
  form: ReservationInput;
  setForm: Dispatch<SetStateAction<ReservationInput>>;
  editTarget: Reservation | null;
  saving: boolean;
  error: string;
  nights: number;
  roomCharges: number;
  bookingTotal: number;
  roomTypes: AvailableRoomType[];
  hasAvailability: boolean;
  ratePlans: RatePlanOption[];
  paymentMethods: PaymentMethodOption[];
  groupBlocks: GroupBlock[];
  setGroupBlocks: Dispatch<SetStateAction<GroupBlock[]>>;
  guestMatches: GuestSearchResult[];
  onSelectGuest: (guest: GuestSearchResult) => void;
  onDocumentFile: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

const amount = (value?: number | null) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const datePart = (value?: string) => (value ? value.slice(0, 10) : "");
const timePart = (value?: string) => (value && value.length >= 16 ? value.slice(11, 16) : "");
const joinDateTime = (date: string, time: string) => (date ? `${date}T${time || "00:00"}` : "");
const localDateTime = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const statusOptions: { value: ReservationInput["status"]; label: string }[] = [
  { value: "confirmed", label: "Confirmed" }, { value: "tentative", label: "Tentative" }, { value: "waiting", label: "Waiting list" },
];

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <section className="rf-section">
    <span className="rf-section-icon">{icon}</span>
    <div className="rf-section-body"><h3>{title}</h3>{children}</div>
  </section>;
}

function Field({ label, icon, className = "", children }: { label: string; icon?: ReactNode; className?: string; children: ReactNode }) {
  return <label className={`rf-field ${className}`}>
    <span className="rf-label">{label}</span>
    <span className={`rf-control${icon ? " has-icon" : ""}`}>{icon && <span className="rf-control-icon">{icon}</span>}{children}</span>
  </label>;
}

function Stepper({ label, icon, value, min, max, onChange }: { label: string; icon: ReactNode; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return <Field label={label} icon={icon} className="rf-stepper">
    <input type="number" min={min} max={max} value={value} onChange={event => onChange(clamp(Number(event.target.value)))}/>
    <span className="rf-stepper-buttons">
      <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + 1))} disabled={value >= max}><ChevronUp size={13}/></button>
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - 1))} disabled={value <= min}><ChevronDown size={13}/></button>
    </span>
  </Field>;
}

export default function ReservationFormModal(props: Props) {
  const { form, setForm, editTarget, saving, error, nights, roomCharges, bookingTotal, roomTypes, hasAvailability, ratePlans, paymentMethods, groupBlocks, setGroupBlocks, guestMatches } = props;
  const set = (changes: Partial<ReservationInput>) => setForm(current => ({ ...current, ...changes }));
  const setGuest = (changes: Partial<ReservationInput["guest"]>) => setForm(current => ({ ...current, guest: { ...current.guest, ...changes } }));
  const setBlock = (index: number, changes: Partial<GroupBlock>) => setGroupBlocks(items => items.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  const advance = Number(form.advance_payment_amount) || 0;
  const dueAmount = bookingTotal - advance;
  const setRelease = (value: string) => setForm(current => ({
    ...current, release_at: value,
    reminder_at: current.reminder_at || (value ? localDateTime(new Date(new Date(value).getTime() - 86400000)) : ""),
  }));

  return <div className="fo-modal-backdrop">
    <form className="rf-modal" onSubmit={props.onSubmit}>
      <header className="rf-header">
        <span className="rf-header-icon"><Building2 size={26}/></span>
        <div className="rf-header-text">
          <p className="rf-eyebrow">FRONT OFFICE</p>
          <h2>{editTarget ? "Edit Reservation" : "New Reservation"}</h2>
          <div className="rf-header-meta">
            {editTarget && <span className="rf-code">{editTarget.reservation_code}</span>}
            <span className={`rf-status-pill st-${form.status}`}>
              <i/>
              <select aria-label="Reservation status" value={form.status} onChange={event => set({ status: event.target.value as ReservationInput["status"] })}>
                {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown size={14}/>
            </span>
          </div>
        </div>
        <button type="button" className="rf-close" aria-label="Close" disabled={saving} onClick={props.onClose}><X size={18}/></button>
      </header>

      <div className="rf-body">
        <div className="rf-sections">
          <Section icon={<CalendarDays size={19}/>} title="Stay Details">
            <div className="rf-row rf-row-stay">
              <Field label="Check-in" icon={<CalendarDays size={15}/>}>
                <input required type="date" value={form.check_in_date} onChange={event => set({ check_in_date: event.target.value, room_category: "", room_number: "" })}/>
              </Field>
              <Field label="Check-out" icon={<CalendarDays size={15}/>}>
                <input required type="date" value={form.check_out_date} onChange={event => set({ check_out_date: event.target.value, room_category: "", room_number: "" })}/>
              </Field>
              <div className="rf-field">
                <span className="rf-label">Total nights</span>
                <span className="rf-nights"><Moon size={16}/>{nights ? `${nights} night${nights === 1 ? "" : "s"}` : "Select dates"}</span>
              </div>
              <label className="rf-toggle">
                <input type="checkbox" checked={Boolean(form.is_group_booking)} onChange={event => set({ is_group_booking: event.target.checked })}/>
                <span className="rf-toggle-track"/>Group booking
              </label>
            </div>
          </Section>

          <Section icon={<FileText size={19}/>} title="Booking Details">
            <div className="rf-row rf-row-3">
              <Field label="Booking source">
                <select value={form.source} onChange={event => set({ source: event.target.value })}>
                  <option value="front_desk">Direct</option><option value="walk_in">Walk-in</option><option value="online">Online</option><option value="agent">Travel agent</option>
                </select>
              </Field>
              <Field label="Market code" icon={<Tag size={15}/>}>
                <input value={form.market_code || ""} placeholder="Optional code" onChange={event => set({ market_code: event.target.value })}/>
              </Field>
              <Field label="Reservation status" icon={<i className={`rf-dot st-${form.status}`}/>}>
                <select value={form.status} onChange={event => set({ status: event.target.value as ReservationInput["status"] })}>
                  {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section icon={<CreditCard size={19}/>} title="Advance & Payment">
            <div className="rf-row rf-row-5">
              <Field label="Required advance" icon={<IndianRupee size={14}/>}>
                <input min="0" type="number" value={form.required_advance_amount || 0} onChange={event => set({ required_advance_amount: Number(event.target.value) })}/>
              </Field>
              <Field label="Advance received" icon={<IndianRupee size={14}/>}>
                <input min="0" type="number" value={form.advance_payment_amount} onChange={event => set({ advance_payment_amount: Number(event.target.value) })}/>
              </Field>
              <Field label="Deposit due by" icon={<CalendarDays size={15}/>}>
                <input type="date" value={datePart(form.deposit_due_at)} onChange={event => set({ deposit_due_at: event.target.value ? `${event.target.value}T23:59` : "" })}/>
              </Field>
              <Field label="Due amount" icon={<IndianRupee size={14}/>} className="is-readonly">
                <input readOnly tabIndex={-1} value={dueAmount.toLocaleString("en-IN")}/>
              </Field>
              <Field label="Discount" icon={<IndianRupee size={14}/>}>
                <input min="0" type="number" value={form.discount_amount} onChange={event => set({ discount_amount: Number(event.target.value) })}/>
              </Field>
            </div>
            <div className="rf-row rf-row-2">
              <Field label="Paid via" icon={<Wallet size={15}/>}>
                <select value={form.advance_payment_method} onChange={event => set({ advance_payment_method: event.target.value })}>
                  <option value="">Select payment method</option>
                  {paymentMethods.map(method => <option key={method.code} value={method.code}>{method.label}</option>)}
                </select>
              </Field>
              <Field label="Payment reference" icon={<Receipt size={15}/>}>
                <input value={form.advance_payment_reference} placeholder="Transaction or receipt number" onChange={event => set({ advance_payment_reference: event.target.value })}/>
              </Field>
            </div>
          </Section>

          <Section icon={<Clock size={19}/>} title="Important Dates">
            <div className="rf-row rf-row-dates">
              <div className="rf-pair">
                <span className="rf-label">Release date & time</span>
                <div className="rf-pair-inputs">
                  <span className="rf-control has-icon"><span className="rf-control-icon"><CalendarDays size={15}/></span>
                    <input type="date" aria-label="Release date" value={datePart(form.release_at)} onChange={event => setRelease(joinDateTime(event.target.value, timePart(form.release_at)))}/></span>
                  <span className="rf-control has-icon"><span className="rf-control-icon"><Clock size={15}/></span>
                    <input type="time" aria-label="Release time" disabled={!form.release_at} value={timePart(form.release_at)} onChange={event => set({ release_at: joinDateTime(datePart(form.release_at), event.target.value) })}/></span>
                </div>
              </div>
              <div className="rf-pair">
                <span className="rf-label">Reminder date & time</span>
                <div className="rf-pair-inputs">
                  <span className="rf-control has-icon"><span className="rf-control-icon"><CalendarDays size={15}/></span>
                    <input type="date" aria-label="Reminder date" value={datePart(form.reminder_at)} onChange={event => set({ reminder_at: joinDateTime(event.target.value, timePart(form.reminder_at)) })}/></span>
                  <span className="rf-control has-icon"><span className="rf-control-icon"><Clock size={15}/></span>
                    <input type="time" aria-label="Reminder time" disabled={!form.reminder_at} value={timePart(form.reminder_at)} onChange={event => set({ reminder_at: joinDateTime(datePart(form.reminder_at), event.target.value) })}/></span>
                </div>
              </div>
            </div>
          </Section>

          {!form.is_group_booking && <Section icon={<BedDouble size={19}/>} title="Room & Guests">
            <div className="rf-row rf-row-room">
              <Field label="Available room type">
                <select value={form.room_category} onChange={event => { const type = roomTypes.find(item => item.room_category === event.target.value); set({ room_category: event.target.value, room_number: type?.room_numbers[0] || "" }); }}>
                  <option value="">{form.check_in_date && form.check_out_date ? "Select room type" : "Select stay dates first"}</option>
                  {roomTypes.map(type => <option key={type.room_category} value={type.room_category}>{type.room_category}{hasAvailability ? ` - ${type.available_rooms} available` : ""}</option>)}
                </select>
              </Field>
              <Field label="Room number" icon={<DoorOpen size={15}/>}>
                <input value={form.room_number} placeholder="Optional" onChange={event => set({ room_number: event.target.value })}/>
              </Field>
              <Stepper label="Adults" icon={<User size={15}/>} value={form.adults} min={1} max={20} onChange={adults => set({ adults })}/>
              <Stepper label="Children" icon={<UserRound size={15}/>} value={form.children} min={0} max={20} onChange={children => set({ children })}/>
              <Stepper label="Rooms" icon={<BedDouble size={15}/>} value={form.rooms_count} min={1} max={10} onChange={rooms_count => set({ rooms_count })}/>
            </div>
          </Section>}

          {!form.is_group_booking && <Section icon={<Percent size={19}/>} title="Rate & Charges">
            <div className="rf-row rf-row-4">
              <Field label="Rate type / meal plan" className="rf-span-2">
                <select value={form.rate_plan} disabled={!form.room_category} onChange={event => { const plan = ratePlans.find(item => item.name === event.target.value); set({ rate_plan: event.target.value, nightly_rate: plan?.nightly_rate ?? 0, rate_override_reason: "" }); }}>
                  <option value="">{form.room_category ? "Select rate type" : "Select room type first"}</option>
                  {form.rate_plan && !ratePlans.some(plan => plan.name === form.rate_plan) && <option value={form.rate_plan}>{form.rate_plan} (current)</option>}
                  {ratePlans.map(plan => <option key={plan.id} value={plan.name}>{plan.name} · {amount(plan.nightly_rate)}/night</option>)}
                </select>
              </Field>
              <Field label="Nightly rate" icon={<IndianRupee size={14}/>}>
                <input min="0" type="number" value={form.nightly_rate} onChange={event => set({ nightly_rate: Number(event.target.value) })}/>
              </Field>
              <Field label="Tax amount" icon={<IndianRupee size={14}/>}>
                <input min="0" type="number" value={form.taxes_amount} onChange={event => set({ taxes_amount: Number(event.target.value) })}/>
              </Field>
              <Field label="Additional charges" icon={<IndianRupee size={14}/>}>
                <input min="0" type="number" value={form.additional_charges} onChange={event => set({ additional_charges: Number(event.target.value) })}/>
              </Field>
              <Field label="Rate override reason" className="rf-span-3">
                <input value={form.rate_override_reason} placeholder="Reason, if a negotiated rate is used" onChange={event => set({ rate_override_reason: event.target.value })}/>
              </Field>
            </div>
          </Section>}

          {form.is_group_booking && <Section icon={<BedDouble size={19}/>} title="Group Booking">
            <div className="rf-row rf-row-3">
              <Field label="Total group size"><input required min="1" type="number" value={form.group_size || ""} onChange={event => set({ group_size: Number(event.target.value) })}/></Field>
              <Field label="Group name"><input required value={form.group_name || ""} onChange={event => set({ group_name: event.target.value })}/></Field>
              <Field label="Business source"><input required value={form.business_source || ""} placeholder="Company or tour operator" onChange={event => set({ business_source: event.target.value })}/></Field>
            </div>
            <div className="rf-blocks">
              {groupBlocks.map((block, index) => <div className="rf-block" key={index}>
                <Field label="Room type">
                  <select value={block.room_category} onChange={event => setBlock(index, { room_category: event.target.value })}>
                    <option value="">Room type</option>
                    {roomTypes.map(type => <option key={type.room_category} value={type.room_category}>{type.room_category}</option>)}
                  </select>
                </Field>
                <Field label="Rate type">
                  <select value={block.rate_plan} onChange={event => setBlock(index, { rate_plan: event.target.value, nightly_rate: ratePlans.find(plan => plan.name === event.target.value)?.nightly_rate ?? 0 })}>
                    <option value="">Rate type</option>
                    {ratePlans.map(plan => <option key={plan.id} value={plan.name}>{plan.name}</option>)}
                  </select>
                </Field>
                <Field label="Rooms"><input min="1" type="number" value={block.rooms_count} onChange={event => setBlock(index, { rooms_count: Number(event.target.value) })}/></Field>
                <Field label="Adults"><input min="1" type="number" value={block.adults} onChange={event => setBlock(index, { adults: Number(event.target.value) })}/></Field>
                <Field label="Children"><input min="0" type="number" value={block.children} onChange={event => setBlock(index, { children: Number(event.target.value) })}/></Field>
                <Field label="Nightly rate" icon={<IndianRupee size={14}/>}><input min="0" type="number" value={block.nightly_rate} onChange={event => setBlock(index, { nightly_rate: Number(event.target.value) })}/></Field>
                <button type="button" className="rf-block-remove" onClick={() => setGroupBlocks(items => items.filter((_, i) => i !== index))} disabled={groupBlocks.length === 1} aria-label="Remove room block" title="Remove room block"><X size={16}/></button>
              </div>)}
              <button type="button" className="rf-add-block" onClick={() => setGroupBlocks(items => [...items, { room_category: "", rate_plan: "", rooms_count: 1, adults: 1, children: 0, nightly_rate: 0 }])}>+ Add room</button>
            </div>
          </Section>}

          <Section icon={<User size={19}/>} title="Guest Information">
            <div className="rf-row rf-row-2">
              <Field label="First name" className="rf-has-matches">
                <input required value={form.guest.first_name} onChange={event => setForm(current => ({ ...current, guest_id: undefined, guest: { ...current.guest, first_name: event.target.value } }))}/>
                {guestMatches.length > 0 && <span className="rf-matches">{guestMatches.map(guest => <button type="button" key={guest.id} onClick={() => props.onSelectGuest(guest)}>{guest.first_name} {guest.last_name} <small>{guest.mobile || guest.email}</small></button>)}</span>}
              </Field>
              <Field label="Last name">
                <input required value={form.guest.last_name} onChange={event => setForm(current => ({ ...current, guest_id: undefined, guest: { ...current.guest, last_name: event.target.value } }))}/>
              </Field>
              <Field label="Email"><input type="email" value={form.guest.email} onChange={event => setGuest({ email: event.target.value })}/></Field>
              <Field label="Mobile"><input value={form.guest.mobile} onChange={event => setGuest({ mobile: event.target.value })}/></Field>
              <Field label="Address" className="rf-span-all"><input value={form.guest.address} onChange={event => setGuest({ address: event.target.value })}/></Field>
              <Field label="Document type">
                <select value={form.guest.identity_type} onChange={event => setGuest({ identity_type: event.target.value })}>
                  <option value="">Select document</option><option value="Aadhaar">Aadhaar</option><option value="Passport">Passport</option><option value="Driving License">Driving License</option>
                </select>
              </Field>
              <Field label="Document number"><input value={form.guest.identity_number} onChange={event => setGuest({ identity_number: event.target.value })}/></Field>
              <Field label="Nationality"><input value={form.guest.nationality || ""} onChange={event => setGuest({ nationality: event.target.value })}/></Field>
              <Field label="Identity proof upload" className="rf-file"><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={event => props.onDocumentFile(event.target.files?.[0] || null)}/></Field>
            </div>
          </Section>

          <Section icon={<MessageSquare size={19}/>} title="Notes">
            <label className="rf-field">
              <span className="rf-label">Special requests</span>
              <textarea value={form.special_requests} placeholder="Anything the front desk should know" onChange={event => set({ special_requests: event.target.value })}/>
            </label>
            <label className="rf-check"><input type="checkbox" checked={form.send_confirmation_voucher} onChange={event => set({ send_confirmation_voucher: event.target.checked })}/>Email booking confirmation and voucher</label>
          </Section>
        </div>

        <aside className="rf-side">
          <div className="rf-summary">
            <h3><span><Receipt size={17}/></span>Billing Summary</h3>
            <dl>
              <div><dt><CalendarDays size={16}/>Check-in</dt><dd className="strong">{form.check_in_date || "—"}</dd></div>
              <div><dt><CalendarCheck size={16}/>Check-out</dt><dd className="strong">{form.check_out_date || "—"}</dd></div>
              <div><dt><BedDouble size={16}/>Room charges</dt><dd>{amount(roomCharges)}</dd></div>
              <div><dt><FileText size={16}/>Taxes & extras</dt><dd>{amount((Number(form.taxes_amount) || 0) + (Number(form.additional_charges) || 0))}</dd></div>
              <div><dt><Tag size={16}/>Discount</dt><dd>-{amount(form.discount_amount)}</dd></div>
            </dl>
            <div className="rf-total"><span><Wallet size={19}/>Total</span><strong>{amount(bookingTotal)}</strong></div>
            <dl>
              <div><dt><CreditCard size={16}/>Advance received</dt><dd>{amount(advance)}</dd></div>
              <div className="rf-due"><dt><Clock size={16}/>Due amount</dt><dd>{amount(dueAmount)}</dd></div>
            </dl>
            <Leaf className="rf-leaf" size={54} strokeWidth={1}/>
          </div>
          {error && <p className="rf-error">{error}</p>}
          <footer className="rf-footer">
            <button type="button" className="rf-cancel" disabled={saving} onClick={props.onClose}>Cancel</button>
            <button className="rf-submit" disabled={saving}>{saving ? <><LoaderCircle size={16} className="rf-spin"/>Saving…</> : <><CalendarPlus size={16}/>{editTarget ? "Update Reservation" : "Create Reservation"}</>}</button>
          </footer>
        </aside>
      </div>
    </form>
  </div>;
}
