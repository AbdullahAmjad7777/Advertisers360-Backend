import { body } from 'express-validator';

// Max lengths of the employee text columns (advertiser360.sql +
// migrations). MySQL runs in STRICT mode, so a longer value isn't truncated,
// the INSERT fails, so every form that writes these columns validates
// against this one list first and tells the user which field is too long.
export const EMPLOYEE_FIELD_LIMITS = {
  fullName: { max: 150, label: 'Full name' },
  phone: { max: 20, label: 'Phone' },
  cnicNumber: { max: 20, label: 'CNIC' },
  address: { max: 255, label: 'Address' },
  emergencyContactName: { max: 150, label: 'Emergency contact name' },
  emergencyContactPhone: { max: 20, label: 'Emergency contact phone' },
  emergencyContactRelation: { max: 50, label: 'Emergency contact relation' },
  bankName: { max: 100, label: 'Bank name' },
  accountTitle: { max: 150, label: 'Account title' },
  accountNumber: { max: 50, label: 'Account number' },
  iban: { max: 50, label: 'IBAN' },
};

// DB column name -> label, for errorHandler's ER_DATA_TOO_LONG message.
export const COLUMN_LABELS = {
  full_name: 'Full name',
  phone: 'Phone',
  cnic_number: 'CNIC',
  address: 'Address',
  emergency_contact_name: 'Emergency contact name',
  emergency_contact_phone: 'Emergency contact phone',
  emergency_contact_relation: 'Emergency contact relation',
  bank_name: 'Bank name',
  account_title: 'Account title',
  account_number: 'Account number',
  iban: 'IBAN',
  email: 'Email',
  title: 'Title',
  reason: 'Reason',
};

// Length checks for whichever of these fields a route accepts. Each field
// is optional here; routes add their own required/format rules separately.
export function employeeFieldLengthValidators(fields = Object.keys(EMPLOYEE_FIELD_LIMITS)) {
  return fields.map((field) => {
    const { max, label } = EMPLOYEE_FIELD_LIMITS[field];
    return body(field)
      .optional({ values: 'falsy' })
      .isString()
      .trim()
      .isLength({ max })
      .withMessage(`${label} must be at most ${max} characters`);
  });
}
