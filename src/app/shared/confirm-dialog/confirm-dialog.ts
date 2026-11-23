import { NgFor, NgIf } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [NgFor, NgIf],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialog implements AfterViewInit, OnDestroy {
  @Input() title = 'Megerősítés';
  @Input() subject = '';
  @Input() message = '';
  @Input() details: string[] = [];
  @Input() confirmLabel: string | null = 'Megerősítés';
  @Input() cancelLabel = 'Mégse';
  @Input() busy = false;
  @Input() error: string | null = null;
  @Output() readonly confirmed = new EventEmitter<void>();
  @Output() readonly cancelled = new EventEmitter<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  ngAfterViewInit(): void {
    this.host.nativeElement
      .querySelector<HTMLElement>('[data-dialog-action], button:not([disabled])')
      ?.focus();
  }

  ngOnDestroy(): void {
    this.returnFocus?.focus();
  }

  @HostListener('keydown', ['$event'])
  keepFocusInside(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  @HostListener('keydown.escape', ['$event'])
  closeOnEscape(event: Event): void {
    event.preventDefault();
    if (!this.busy) this.cancelled.emit();
  }

  confirm(): void {
    if (this.busy || this.confirmLabel === null) return;
    this.confirmed.emit();
  }

  cancel(): void {
    if (!this.busy) this.cancelled.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }
}
