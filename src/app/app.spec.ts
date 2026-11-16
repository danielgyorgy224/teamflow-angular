import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';
import { API_BASE_URL } from './core/api/api-config';

const USERS = [
  { id: 1, name: 'Kiss Anna', email: 'anna@example.com', role: 'Frontend fejlesztő', active: true },
  { id: 2, name: 'Nagy Bence', email: 'bence@example.com', role: 'Frontend fejlesztő', active: true },
  { id: 3, name: 'Inaktív Ilona', email: 'ilona@example.com', role: 'Tesztelő', active: false },
];

describe('App (alkalmazásváz)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  function render() {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture;
  }

  it('öt menüpontot rajzol ki', () => {
    const fixture = render();
    http.expectOne(`${API_BASE_URL}/users`).flush(USERS);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('nav a').length).toBe(5);
  });

  it('a fejléc csak az aktív csapattagokat számolja, és az 1-es felhasználót mutatja', () => {
    const fixture = render();
    http.expectOne(`${API_BASE_URL}/users`).flush(USERS);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.team-pill')?.textContent).toContain('2 csapattag');
    expect(el.querySelector('.sidebar-user')?.textContent).toContain('Kiss Anna');
  });

  it('API-hiba esetén érthető jelzést mutat, és az alkalmazás nem omlik össze', () => {
    const fixture = render();
    http
      .expectOne(`${API_BASE_URL}/users`)
      .flush('hiba', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.team-pill')?.textContent).toContain('nem elérhető');
    expect(el.querySelectorAll('nav a').length).toBe(5);
  });

  it('a mobil menü gombbal nyílik, Escape-re záródik', () => {
    const fixture = render();
    http.expectOne(`${API_BASE_URL}/users`).flush(USERS);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector<HTMLButtonElement>('.menu-btn')!;

    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.shell')?.classList.contains('menu-open')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.shell')?.classList.contains('menu-open')).toBe(false);
  });
});
