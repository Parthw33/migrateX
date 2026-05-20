import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from '@remix-run/react';
import { toast } from 'react-toastify';
import { checkAuthOnLoad, loginAuth } from '~/lib/stores/auth';
import { migratexApiUrl } from '~/lib/lambdaApi';
import { Select } from '~/components/ui/Select';

const LOGIN_TOAST_ID = 'login-toast';

/** Milliseconds before login success/error toasts dismiss (loading uses `autoClose: false`). */
const LOGIN_TOAST_AUTO_CLOSE_MS = 5000;

/** Prefer API fields used by migratex auth: `error_message`, `error`, `message`. */
function apiErrorText(data: { error_message?: string; error?: string; message?: string }, fallback: string) {
  return data.error_message || data.error || data.message || fallback;
}

const REGIONS = [
  { value: 'NA', label: 'North America (AWS)' },
  { value: 'AZURE_NA', label: 'North America (Azure)' },
  { value: 'GCP_NA', label: 'North America (GCP)' },
  { value: 'EU', label: 'Europe (AWS)' },
  { value: 'AZURE_EU', label: 'Europe (Azure)' },
  { value: 'GCP_EU', label: 'Europe (GCP)' },
  { value: 'AU', label: 'Australia (AWS)' },
];

interface LoginFormState {
  email: string;
  password: string;
  region: string;
  tfaToken: string;
}

type FieldErrors = { email?: string; password?: string; tfaToken?: string };
type FieldTouched = { email?: boolean; password?: boolean; tfaToken?: boolean };

const EMAIL_REGEX = /^[a-z0-9._%+-]+@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

function inputClass(hasError: boolean) {
  const border = hasError ? 'border-red-400' : 'border-migratex-elements-borderColor';
  return `w-full px-3.5 py-2.5 rounded-lg border text-sm bg-migratex-elements-background-depth-2 text-migratex-elements-textPrimary placeholder-migratex-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition ${border}`;
}

function TfaForm({
  form,
  errors,
  touched,
  onFieldChange,
  onBlur,
  onSendSms: _onSendSms,
}: Readonly<{
  form: LoginFormState;
  errors: FieldErrors;
  touched: FieldTouched;
  onFieldChange: (field: string, value: string) => void;
  onBlur: (field: keyof FieldTouched) => void;
  onSendSms: () => void;
}>) {
  return (
    <>
      <div className="mb-5">
        <label htmlFor="tfaToken" className="block text-sm font-medium text-migratex-elements-textPrimary mb-1.5">
          Enter verification code <span className="text-red-500">*</span>
        </label>
        <input
          id="tfaToken"
          type="text"
          autoComplete="one-time-code"
          value={form.tfaToken}
          onChange={(e) => onFieldChange('tfaToken', e.target.value)}
          onBlur={() => onBlur('tfaToken')}
          placeholder="Enter the security code"
          className={inputClass(!!errors.tfaToken && !!touched.tfaToken)}
        />
        {errors.tfaToken && touched.tfaToken && <p className="mt-1 text-xs text-red-500">{errors.tfaToken}</p>}
      </div>
    </>
  );
}

function CredentialsForm({
  form,
  errors,
  touched,
  showPassword,
  onFieldChange,
  onBlur,
  onTogglePassword,
}: Readonly<{
  form: LoginFormState;
  errors: FieldErrors;
  touched: FieldTouched;
  showPassword: boolean;
  onFieldChange: (field: string, value: string) => void;
  onBlur: (field: keyof FieldTouched) => void;
  onTogglePassword: () => void;
}>) {
  return (
    <>
      <div className="mb-5">
        <label htmlFor="region" className="block text-sm font-medium text-migratex-elements-textPrimary mb-1.5">
          Region
        </label>
        <Select
          id="region"
          variant="muted"
          value={form.region}
          onChange={(e) => onFieldChange('region', e.target.value)}
          options={REGIONS.map((r) => ({ value: r.value, label: r.label }))}
        />
      </div>

      <div className="mb-5">
        <label htmlFor="email" className="block text-sm font-medium text-migratex-elements-textPrimary mb-1.5">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => onFieldChange('email', e.target.value)}
          onBlur={() => onBlur('email')}
          placeholder="you@company.com"
          className={inputClass(!!errors.email && !!touched.email)}
        />
        {errors.email && touched.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
      </div>

      <div className="mb-6">
        <label htmlFor="password" className="block text-sm font-medium text-migratex-elements-textPrimary mb-1.5">
          Password <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => onFieldChange('password', e.target.value)}
            onBlur={() => onBlur('password')}
            placeholder="Enter your password"
            className={`${inputClass(!!errors.password && !!touched.password)} pr-10`}
          />
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-migratex-elements-textTertiary hover:text-migratex-elements-textPrimary transition"
            tabIndex={-1}
          >
            <div className={showPassword ? 'i-ph:eye-slash text-lg' : 'i-ph:eye text-lg'} />
          </button>
        </div>
        {errors.password && touched.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
      </div>
    </>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginFormState>({ email: '', password: '', region: 'NA', tfaToken: '' });
  const [showTfa, setShowTfa] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<FieldTouched>({});
  const submittingRef = useRef(false);

  useEffect(() => {
    if (checkAuthOnLoad()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  function validate(field?: string) {
    const newErrors: FieldErrors = {};

    if (!field || field === 'email') {
      if (!form.email) {
        newErrors.email = 'Email is required';
      } else if (!EMAIL_REGEX.test(form.email)) {
        newErrors.email = 'Please enter a valid email address';
      }
    }

    if ((!field || field === 'password') && !form.password) {
      newErrors.password = 'Please enter a password';
    }

    if ((!field || field === 'tfaToken') && showTfa && !form.tfaToken.trim()) {
      newErrors.tfaToken = 'Verification code is required';
    }

    setErrors((prev) => ({ ...prev, ...newErrors }));

    return Object.keys(newErrors).length === 0;
  }

  function handleBlur(field: keyof FieldTouched) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validate(field);
  }

  function handleFieldChange(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  /** POST /auth/login after password has been verified (with or without MFA). */
  async function completeMigratexLogin(tfaToken: string) {
    const body: Record<string, string> = {
      email: form.email,
      password: form.password,
      region: form.region,
      tfa_token: tfaToken,
    };

    let res: Response;

    try {
      res = await fetch(migratexApiUrl('/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      toast.update(LOGIN_TOAST_ID, {
        type: 'error',
        isLoading: false,
        autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
        render: 'Unable to reach the login service. Check your network and try again.',
      });

      return;
    }

    let data: {
      tfa_required?: boolean;
      error_message?: string;
      error?: string;
      error_code?: number;
      token?: string;
      cs_user_id?: string;
      cs_region?: string;
      message?: string;
    };

    try {
      data = await res.json();
    } catch {
      toast.update(LOGIN_TOAST_ID, {
        type: 'error',
        isLoading: false,
        autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
        render: `Server error (${res.status}): Received an unexpected response. Please try again.`,
      });

      return;
    }

    if (data.tfa_required) {
      toast.update(LOGIN_TOAST_ID, {
        type: 'info',
        isLoading: false,
        autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
        render: apiErrorText(data, 'Two-factor authentication is still required.'),
      });

      return;
    }

    if (!res.ok) {
      const errMsg = apiErrorText(data, 'Login failed.');
      toast.update(LOGIN_TOAST_ID, {
        type: 'error',
        isLoading: false,
        autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
        render: `${errMsg} (${res.status})`,
      });

      return;
    }

    if (!data.token) {
      toast.update(LOGIN_TOAST_ID, {
        type: 'error',
        isLoading: false,
        autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
        render: 'Login failed: No token received.',
      });

      return;
    }

    const region = data.cs_region || form.region;
    loginAuth(data.token, region, form.email, data.cs_user_id ?? null);
    toast.update(LOGIN_TOAST_ID, {
      type: 'success',
      isLoading: false,
      autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
      render: data.message || 'Signed in successfully.',
    });
    navigate('/dashboard', { replace: true });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!showTfa) {
      setTouched({ email: true, password: true, tfaToken: false });

      if (!validate()) {
        return;
      }

      if (submittingRef.current) {
        return;
      }

      submittingRef.current = true;
      setIsLoading(true);
      toast.dismiss(LOGIN_TOAST_ID);
      toast.loading('Verifying credentials…', { toastId: LOGIN_TOAST_ID, autoClose: false });

      try {
        let verifyRes: Response;

        try {
          verifyRes = await fetch('/api/contentstack-user-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: form.email,
              password: form.password,
            }),
          });
        } catch {
          toast.update(LOGIN_TOAST_ID, {
            type: 'error',
            isLoading: false,
            autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
            render: 'Unable to reach the login service. Check your network and try again.',
          });

          return;
        }

        let verifyData: {
          password_verified?: boolean;
          tfa_required?: boolean;
          error_message?: string;
          error?: string;
          message?: string;
        };

        try {
          verifyData = await verifyRes.json();
        } catch {
          toast.update(LOGIN_TOAST_ID, {
            type: 'error',
            isLoading: false,
            autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
            render: `Server error (${verifyRes.status}): Received an unexpected response. Please try again.`,
          });

          return;
        }

        if (!verifyRes.ok) {
          toast.update(LOGIN_TOAST_ID, {
            type: 'error',
            isLoading: false,
            autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
            render: `${apiErrorText(verifyData, 'Verification failed.')} (${verifyRes.status})`,
          });

          return;
        }

        if (verifyData.password_verified && verifyData.tfa_required) {
          toast.dismiss(LOGIN_TOAST_ID);
          setShowTfa(true);
          setTouched({});
          setErrors({});

          return;
        }

        if (verifyData.password_verified && !verifyData.tfa_required) {
          toast.loading('Signing in…', { toastId: LOGIN_TOAST_ID, autoClose: false });
          await completeMigratexLogin('');

          return;
        }

        toast.update(LOGIN_TOAST_ID, {
          type: 'error',
          isLoading: false,
          autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
          render: apiErrorText(verifyData, 'Could not verify credentials.'),
        });
      } catch (error) {
        console.error('Verify password request failed:', error);
        toast.update(LOGIN_TOAST_ID, {
          type: 'error',
          isLoading: false,
          autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
          render: 'An unexpected error occurred. Please try again.',
        });
      } finally {
        setIsLoading(false);
        submittingRef.current = false;
      }

      return;
    }

    setTouched({ email: true, password: true, tfaToken: true });

    if (!validate()) {
      return;
    }

    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    setIsLoading(true);
    toast.dismiss(LOGIN_TOAST_ID);
    toast.loading('Signing in…', { toastId: LOGIN_TOAST_ID, autoClose: false });

    try {
      await completeMigratexLogin(form.tfaToken.trim());
    } catch (error) {
      console.error('Login request failed:', error);
      toast.update(LOGIN_TOAST_ID, {
        type: 'error',
        isLoading: false,
        autoClose: LOGIN_TOAST_AUTO_CLOSE_MS,
        render: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsLoading(false);
      submittingRef.current = false;
    }
  }

  async function handleSendSms() {
    const smsToastId = 'sms-toast';
    toast.dismiss(smsToastId);

    try {
      const res = await fetch(migratexApiUrl('/auth/request-token-sms'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password, region: form.region }),
      });

      const data: { notice?: string; error_message?: string; error?: string } = await res.json();

      if (res.ok && data.notice) {
        toast.success(data.notice, { toastId: smsToastId });
      } else {
        toast.error(apiErrorText(data, 'Failed to send SMS.'), { toastId: smsToastId });
      }
    } catch (error) {
      console.error('SMS request failed:', error);
      toast.error('Unable to send SMS. Please try again.', { toastId: smsToastId });
    }
  }

  function handleBackToLogin() {
    setShowTfa(false);
    setForm((f) => ({ ...f, tfaToken: '' }));
    setErrors({});
    setTouched({});
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-migratex-elements-background-depth-2">
      <div className="w-full border-b border-migratex-elements-borderColor bg-migratex-elements-background-depth-1 py-4 px-6 fixed top-0 left-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-3">
          <svg width="28" height="28" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M19.715 9.945v4.107l-9.878 1.37L0 14.052V9.945l9.837-1.37 9.878 1.37zM0 19.529v-4.107l5.75 3.08 13.965-3.08v4.107L5.75 23.979 0 19.53z"
              fill="#AC75FF"
            />
            <path d="M19.715 4.47v4.107l-5.75-3.08L0 8.577V4.47L13.965.02l5.75 4.45z" fill="#AC75FF" />
          </svg>
          <span className="text-xl font-semibold text-migratex-elements-textPrimary">Migrate X</span>
        </div>
      </div>

      <div className="w-full max-w-md px-6 pt-24 pb-12">
        <div className="bg-migratex-elements-background-depth-1 rounded-xl border border-migratex-elements-borderColor shadow-sm p-8">
          <h2 className="text-2xl font-bold text-migratex-elements-textPrimary mb-2 text-center">
            {showTfa ? 'Multi-Factor Authentication' : 'Sign in to your account'}
          </h2>
          <p className="text-sm text-migratex-elements-textSecondary mb-8 text-center">
            {showTfa
              ? 'Enter the security code from your authenticator app.'
              : 'Use your Contentstack credentials to continue.'}
          </p>

          <form onSubmit={handleSubmit} noValidate>
            {showTfa ? (
              <TfaForm
                form={form}
                errors={errors}
                touched={touched}
                onFieldChange={handleFieldChange}
                onBlur={handleBlur}
                onSendSms={handleSendSms}
              />
            ) : (
              <CredentialsForm
                form={form}
                errors={errors}
                touched={touched}
                showPassword={showPassword}
                onFieldChange={handleFieldChange}
                onBlur={handleBlur}
                onTogglePassword={() => setShowPassword((v) => !v)}
              />
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-lg bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500/40 disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {isLoading && <div className="i-svg-spinners:90-ring-with-bg text-lg" />}
              {showTfa ? 'Sign in' : 'Continue'}
            </button>

            {showTfa && (
              <button
                type="button"
                onClick={handleBackToLogin}
                className="w-full mt-3 py-2.5 px-4 rounded-lg border border-migratex-elements-borderColor text-migratex-elements-textSecondary font-medium text-sm hover:bg-migratex-elements-background-depth-2 transition"
              >
                Back to login
              </button>
            )}
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-migratex-elements-textTertiary">
          &copy; {new Date().getFullYear()} Contentstack. All rights reserved.
        </p>
      </div>
    </div>
  );
}
