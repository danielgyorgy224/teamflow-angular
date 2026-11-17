import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RouterStateSnapshot,
  UrlTree,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { adminResourceGuard, isPositiveInt, validIdGuard } from './route-guards';

describe('route guardok', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  const run = (guard: CanActivateFn, params: Record<string, string>): unknown =>
    TestBed.runInInjectionContext(() =>
      guard({ paramMap: convertToParamMap(params) } as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  ['1', '42', '1000'].forEach((id) =>
    it(`validIdGuard: a(z) "${id}" id engedélyezett`, () => {
      expect(run(validIdGuard, { id })).toBe(true);
    }),
  );

  ['0', '-1', '1.5', 'abc', '01', ' 3', '1e3'].forEach((id) =>
    it(`validIdGuard: a(z) "${id}" id hibaoldalra irányít`, () => {
      const result = run(validIdGuard, { id });
      expect(result instanceof UrlTree).toBe(true);
      expect(String(result)).toContain('/not-found');
    }),
  );

  ['labels', 'statuses', 'priorities'].forEach((resource) =>
    it(`adminResourceGuard: "${resource}" engedélyezett`, () => {
      expect(run(adminResourceGuard, { resource })).toBe(true);
    }),
  );

  ['users', 'tasks', '../db', ''].forEach((resource) =>
    it(`adminResourceGuard: "${resource}" tiltott, nem lesz belőle API-útvonal`, () => {
      expect(run(adminResourceGuard, { resource }) instanceof UrlTree).toBe(true);
    }),
  );

  it('isPositiveInt: null is hibás', () => {
    expect(isPositiveInt(null)).toBe(false);
  });
});
