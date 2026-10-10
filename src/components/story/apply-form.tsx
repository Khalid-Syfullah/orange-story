"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Sprout, UserRound, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { questions } from "@/content/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EASE } from "@/styles/tokens";

import { BeatLine } from "./beat";
import { APPLY_FIELD_ID } from "./apply-form-ids";
import { SLOTS } from "./slots";

/**
 * Scene 13's form (right half): two short fields side by side, the larger "What should grow?"
 * field, then the send button. The fields are clear glass pills. Hovering or focusing one lifts it
 * forward in a gentle 3D stack while the other two ease back and down, fading and blurring a
 * little (opacity about 0.3s, blur about 0.35s, the story curve); keyboard focus does the same.
 * Validated with react-hook-form and zod; posts to `NEXT_PUBLIC_APPLY_ENDPOINT`, and without one it
 * logs in dev and shows the success message.
 *
 * The hover state is React state, set by pointer and focus events only (never by scroll).
 */

const application = questions.application;
const SOFT_TEXT = "text-[color:var(--story-soft,var(--milk))]";
const DEPTH = "[perspective:900px]";

type FieldName = "name" | "email" | "grow";

const schema = z.object({
  name: z.string().trim().min(1, application.errors.name),
  email: z.string().trim().email(application.errors.email),
  // "At least a sentence": a few words, not a single token.
  grow: z
    .string()
    .trim()
    .refine((v) => v.split(/\s+/).filter(Boolean).length >= 3, application.errors.grow),
});

type Values = z.infer<typeof schema>;

const ICONS: Record<FieldName, LucideIcon> = { name: UserRound, email: Mail, grow: Sprout };
const AUTOCOMPLETE: Record<FieldName, string> = { name: "name", email: "email", grow: "off" };

/** Clear glass: almost transparent, backdrop blur, a fine edge highlight, no shadow. */
const GLASS =
  "w-full rounded-pill border border-white/25 bg-white/[0.05] px-5 text-base text-white backdrop-blur-md placeholder:text-white/40 " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.35),inset_0_0_0_1px_rgba(255,255,255,0.04)] " +
  "focus-visible:border-white/60 focus-visible:ring-0 md:text-base dark:bg-white/[0.05]";

const FIELD_TRANSITION = { opacity: { duration: 0.3, ease: EASE }, filter: { duration: 0.35, ease: EASE }, default: { duration: 0.45, ease: EASE } };

/** One field's place in the stack: forward when active, back and down while another is active. */
function StackItem({ name, active, setActive, className, children }: { name: FieldName; active: FieldName | null; setActive: (n: FieldName | null) => void; className?: string; children: React.ReactNode }) {
  const lifted = active === name;
  const back = active !== null && !lifted;
  return (
    <motion.div
      className={className}
      style={{ transformOrigin: "50% 60%" }}
      animate={{
        z: lifted ? 36 : back ? -28 : 0,
        scale: lifted ? 1.03 : back ? 0.97 : 1,
        y: back ? 10 : 0,
        opacity: back ? 0.55 : 1,
        filter: back ? "blur(1.5px)" : "blur(0px)",
      }}
      transition={FIELD_TRANSITION}
      onPointerEnter={() => setActive(name)}
      onPointerLeave={() => setActive(null)}
      onFocusCapture={() => setActive(name)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActive(null);
      }}
    >
      {children}
    </motion.div>
  );
}

function Orb() {
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[130%] -translate-x-1/2 -translate-y-1/2">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.34)_0%,rgba(190,215,255,0.16)_38%,transparent_68%)] blur-2xl" />
    </div>
  );
}

type Status = "idle" | "sending" | "sent";

export function ApplyForm() {
  const [active, setActive] = React.useState<FieldName | null>(null);
  const [status, setStatus] = React.useState<Status>("idle");
  const [failed, setFailed] = React.useState(false);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", grow: "" }, mode: "onTouched" });
  const [name, email, grow] = application.fields;

  async function onSubmit(values: Values) {
    setStatus("sending");
    setFailed(false);
    const endpoint = process.env.NEXT_PUBLIC_APPLY_ENDPOINT;
    if (!endpoint) {
      if (process.env.NODE_ENV !== "production") console.info("[apply] no NEXT_PUBLIC_APPLY_ENDPOINT set; application not sent:", values);
      setStatus("sent");
      return;
    }
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(values) });
      if (!response.ok) throw new Error(`Apply endpoint answered ${response.status}`);
      setStatus("sent");
    } catch {
      setFailed(true);
      setStatus("idle");
    }
  }

  const label = (field: { name: FieldName; label: string }) => {
    const Icon = ICONS[field.name];
    return (
      <FormLabel className="type-label mb-2 ml-4 gap-2 text-white data-[error=true]:text-white">
        <Icon aria-hidden className="size-3.5" strokeWidth={1.5} />
        {field.label}
      </FormLabel>
    );
  };

  return (
    <div className={cn(SLOTS.right.column, "relative")}>
      <Orb />
      {status === "sent" ? (
        <p role="status" className={cn("type-lead", SOFT_TEXT)}>
          {application.success}
        </p>
      ) : (
        <Form {...form}>
          <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-2 gap-3">
              <BeatLine index={0} count={4} className={DEPTH}>
                <StackItem name="name" active={active} setActive={setActive}>
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="gap-0">
                        {label(name)}
                        <FormControl>
                          <Input {...field} id={APPLY_FIELD_ID} autoComplete={AUTOCOMPLETE.name} className={cn(GLASS, "h-12")} />
                        </FormControl>
                        <FormMessage className="type-meta mt-2 ml-4 text-[color:var(--destructive)] normal-case" />
                      </FormItem>
                    )}
                  />
                </StackItem>
              </BeatLine>
              <BeatLine index={1} count={4} className={DEPTH}>
                <StackItem name="email" active={active} setActive={setActive}>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem className="gap-0">
                        {label(email)}
                        <FormControl>
                          <Input {...field} type="email" inputMode="email" autoComplete={AUTOCOMPLETE.email} className={cn(GLASS, "h-12")} />
                        </FormControl>
                        <FormMessage className="type-meta mt-2 ml-4 text-[color:var(--destructive)] normal-case" />
                      </FormItem>
                    )}
                  />
                </StackItem>
              </BeatLine>
            </div>
            <BeatLine index={2} count={4} className={cn("mt-4", DEPTH)}>
              <StackItem name="grow" active={active} setActive={setActive}>
                <FormField
                  control={form.control}
                  name="grow"
                  render={({ field }) => (
                    <FormItem className="gap-0">
                      {label(grow)}
                      <FormControl>
                        <Textarea {...field} autoComplete={AUTOCOMPLETE.grow} rows={4} className={cn(GLASS, "min-h-28 resize-none rounded-[1.75rem] py-4")} />
                      </FormControl>
                      <FormMessage className="type-meta mt-2 ml-4 text-[color:var(--destructive)] normal-case" />
                    </FormItem>
                  )}
                />
              </StackItem>
            </BeatLine>
            <BeatLine index={3} count={4} className="mt-6">
              <Button type="submit" variant="ghost-pill" disabled={status === "sending"}>
                {status === "sending" ? application.sending : application.submit.label}
              </Button>
              {failed ? (
                <p role="alert" className="type-meta mt-3 text-[color:var(--destructive)] normal-case">
                  {application.errors.send}
                </p>
              ) : null}
            </BeatLine>
          </form>
        </Form>
      )}
    </div>
  );
}
