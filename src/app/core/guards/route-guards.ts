import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';

/** Csak ezekből az erőforrásnevekből készülhet /admin/:resource oldal és API-útvonal. */
export const ADMIN_RESOURCES = ['labels', 'statuses', 'priorities'] as const;
export type AdminResource = (typeof ADMIN_RESOURCES)[number];

/** Pozitív egész, vezető nulla és előjel nélkül. */
export function isPositiveInt(value: string | null): boolean {
  return value !== null && /^[1-9]\d*$/.test(value);
}

export function isAdminResource(value: string | null): value is AdminResource {
  return value !== null && (ADMIN_RESOURCES as readonly string[]).includes(value);
}

/** Hibás id-formátumnál érthető hibaoldalra irányít. Nem létező rekordot a részletező kezeli. */
export const validIdGuard: CanActivateFn = (route) =>
  isPositiveInt(route.paramMap.get('id'))
    ? true
    : inject(Router).createUrlTree(['/not-found'], { queryParams: { reason: 'invalid-id' } });

export const adminResourceGuard: CanActivateFn = (route) =>
  isAdminResource(route.paramMap.get('resource'))
    ? true
    : inject(Router).createUrlTree(['/not-found'], { queryParams: { reason: 'invalid-resource' } });

/** Az űrlapkomponens ezt az interfészt valósítja meg a CanDeactivate guardhoz. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) =>
  !component.hasUnsavedChanges() ||
  window.confirm('Nem mentett módosításaid vannak. Biztosan elhagyod az oldalt?');
