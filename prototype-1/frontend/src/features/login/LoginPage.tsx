import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Eye, EyeOff, Lock, LogIn, Mail } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { ApiError } from "@/api/client";
import { login } from "@/api/endpoints";
import { qk } from "@/api/queryKeys";
import { roleLanding, useAuth } from "@/app/AuthProvider";
import { Brand } from "@/components/Brand";
import { Spinner } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

type FormValues = z.infer<typeof schema>;

/** Only same-origin paths are safe to redirect to after login. */
function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export function LoginPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);

  const next = safeNext(params.get("next"));
  const expired = params.get("expired") === "1";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      qc.setQueryData(qk.me, data);
      navigate(next ?? roleLanding(data.user.role), { replace: true });
    },
  });

  if (user) return <Navigate to={next ?? roleLanding(user.role)} replace />;

  const error = mutation.error;
  const isLocked = error instanceof ApiError && error.status === 423;
  const isBadCredentials = error instanceof ApiError && error.status === 401;
  // Anything else (CORS/origin rejection, backend down, network error) must still
  // surface a banner — a silent no-op on Sign In is undebuggable for the user.
  const isOtherError = !!error && !isLocked && !isBadCredentials;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-12">
      <Card className="flex w-full max-w-md flex-col gap-8 rounded-xl p-8 shadow-lg">
        <CardHeader className="items-center gap-4 text-center">
          <Brand size="lg" />
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-xl">Sign in to your account</CardTitle>
            <CardDescription>Enter your credentials to access LabSync</CardDescription>
          </div>
        </CardHeader>

        {expired && !error && (
          <div className="flex items-start gap-2 rounded-lg border border-neutral-200 bg-neutral-100 p-4 text-sm text-neutral-500">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>Your session expired — sign in to continue.</span>
          </div>
        )}

        {isLocked && (
          <div className="flex items-start gap-2 rounded-lg border border-[#797979]/40 bg-[#797979]/10 p-4 text-sm text-[#797979]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>Too many failed attempts. Try again in 15 minutes.</span>
          </div>
        )}

        {isBadCredentials && (
          <div className="flex items-start gap-2 rounded-lg border border-[#797979]/40 bg-[#797979]/10 p-4 text-sm text-[#797979]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {/* Deliberately generic — never reveal which field was wrong. */}
            <span>Invalid email or password. Please try again.</span>
          </div>
        )}

        {isOtherError && (
          <div className="flex items-start gap-2 rounded-lg border border-[#797979]/40 bg-[#797979]/10 p-4 text-sm text-[#797979]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>
              Couldn't reach the server. Make sure you're on{" "}
              <span className="font-semibold">http://localhost:5173</span> and the backend is
              running on port 3000.
            </span>
          </div>
        )}

        <form
          className="flex flex-col gap-5"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@cedt.university.edu"
                className="pl-9"
                disabled={isLocked}
                {...form.register("email")}
              />
            </div>
            {form.formState.errors.email && (
              <p className="text-xs text-neutral-500">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="px-9"
                disabled={isLocked}
                {...form.register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-950"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {form.formState.errors.password && (
              <p className="text-xs text-neutral-500">{form.formState.errors.password.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending || isLocked}>
            {mutation.isPending ? <Spinner /> : <LogIn className="size-4" />}
            Sign In
          </Button>
        </form>

        <p className="text-center text-xs text-neutral-500">Contact CEDT staff for an account.</p>
      </Card>
    </div>
  );
}
