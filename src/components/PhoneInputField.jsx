import Input from 'react-phone-number-input/input';
import flags from 'react-phone-number-input/flags';

const PHFlag = flags.PH;

export default function PhoneInputField({ 
  value = '', 
  onChange, 
  darkMode, 
  error, 
  disabled, 
  placeholder = '912 345 6789' 
}) {
  // 1. Strip "+63" prefix when passing down to <Input /> so it only manages national digits (9XX...)
  const displayValue = value ? value.replace(/^\+63/, '') : '';

  // 2. Handle user typing/pasting
  const handlePhoneChange = (inputValue) => {
    if (!inputValue) {
      onChange('');
      return;
    }

    // Strip any user-typed "+63" or leading zeroes (e.g. "0917..." -> "917...")
    const cleaned = inputValue.replace(/^\+63/, '').replace(/^0+/, '');
    
    // Always supply E.164 (+63...) back to the parent state
    onChange(cleaned ? `+63${cleaned}` : '');
  };

  return (
    <div
      className={[
        'flex items-stretch rounded-lg border overflow-hidden transition-colors',
        darkMode
          ? 'bg-slate-950 border-slate-800 focus-within:border-blue-500'
          : 'bg-white border-slate-200 focus-within:border-blue-600',
        error ? 'border-red-500 focus-within:border-red-500' : '',
        disabled ? 'opacity-60 cursor-not-allowed' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Fixed Philippines Flag + Prefix Badge */}
      <span
        className={`flex items-center gap-1.5 px-3 text-sm font-medium border-r shrink-0 select-none ${
          darkMode ? 'border-slate-800 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700'
        }`}
      >
        <span className="w-5 h-3.5 overflow-hidden rounded-[2px] shrink-0 inline-block">
          <PHFlag title="Philippines" />
        </span>
        <span className="font-semibold">+63</span>
      </span>

      {/* Cleaned Phone Input Component */}
      <Input
        country="PH"
        international={false}
        value={displayValue}
        onChange={handlePhoneChange}
        disabled={disabled}
        placeholder={placeholder}
        type="tel"
        inputMode="numeric"
        className={`flex-1 min-w-0 border-none outline-none bg-transparent px-3 py-2 text-sm ${
          darkMode ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'
        }`}
      />
    </div>
  );
}