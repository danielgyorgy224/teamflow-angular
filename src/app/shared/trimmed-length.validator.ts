import { ValidationErrors, ValidatorFn } from '@angular/forms';

export function trimmedLength(min: number, max: number): ValidatorFn {
  return (control): ValidationErrors | null => {
    const length = String(control.value ?? '').trim().length;
    if (length < min) return { minlength: { requiredLength: min, actualLength: length } };
    if (length > max) return { maxlength: { requiredLength: max, actualLength: length } };
    return null;
  };
}

export function textErrorMessage(errors: ValidationErrors | null, max: number): string | null {
  if (!errors) return null;
  if (errors['minlength']) return 'Adj meg legalább egy nem szóköz karaktert.';
  if (errors['maxlength']) return `Legfeljebb ${max} karakter adható meg.`;
  return 'Ellenőrizd a megadott értéket.';
}
