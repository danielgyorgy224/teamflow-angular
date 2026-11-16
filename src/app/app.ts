import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { AsyncPipe, CommonModule, NgFor, NgIf } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, filter, map, of, startWith, switchMap } from 'rxjs';
import { UserService } from './core/api/user.service';
import { CURRENT_USER_ID } from './core/current-user';
import { User } from './models/user';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

interface ShellVm {
  error: boolean;
  activeCount: number;
  current: User | null;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, AsyncPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '(document:keydown.escape)': 'onEscape()' },
})
export class App {
  private readonly userService = inject(UserService);
  private readonly router = inject(Router);

  readonly navItems: NavItem[] = [
    { path: '/dashboard', label: 'Áttekintés', icon: 'A' },
    { path: '/tasks', label: 'Feladatok', icon: 'F' },
    { path: '/projects', label: 'Projektek', icon: 'P' },
    { path: '/team', label: 'Csapat', icon: 'C' },
    { path: '/admin', label: 'Törzsadatok', icon: 'T' },
  ];

  menuOpen = false;

  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly nav = viewChild<ElementRef<HTMLElement>>('nav');

  readonly vm$ = this.router.events.pipe(
    filter((e): e is NavigationEnd => e instanceof NavigationEnd),
    startWith(null),
    switchMap(() =>
      this.userService.list().pipe(
        map(
          (users): ShellVm => ({
            error: false,
            activeCount: users.filter((u) => u.active).length,
            current: users.find((u) => u.id === CURRENT_USER_ID) ?? null,
          }),
        ),
        catchError(() => of<ShellVm>({ error: true, activeCount: 0, current: null })),
      ),
    ),
  );

  trackByPath = (_: number, item: NavItem) => item.path;

  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
    if (this.menuOpen) {
      setTimeout(() => this.nav()?.nativeElement.querySelector<HTMLElement>('a')?.focus());
    }
  }

  closeMenu(returnFocus = false): void {
    this.menuOpen = false;
    if (returnFocus) {
      this.menuButton()?.nativeElement.focus();
    }
  }

  onEscape(): void {
    if (this.menuOpen) {
      this.closeMenu(true);
    }
  }
}
