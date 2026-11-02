import { TouchSensor, type Activators, type SensorInstance, type SensorProps } from '@dnd-kit/core';

interface HoldOrMoveOptions {
  delay: number;
  distance: number;
}

interface Point {
  x: number;
  y: number;
}

const preventDefault = (e: Event) => e.preventDefault();
const stopPropagation = (e: Event) => e.stopPropagation();

// platform: dnd-kit's TouchSensor begins a drag on a hold or on movement, never on whichever comes first.
export class HoldOrMoveTouchSensor implements SensorInstance {
  static activators: Activators<HoldOrMoveOptions> = [
    {
      eventName: 'onTouchStart',
      handler: ({ nativeEvent }: { nativeEvent: TouchEvent }) => nativeEvent.touches.length === 1,
    },
  ];

  // platform: dnd-kit's TouchSensor.setup holds the iOS touchmove workaround, which this sensor needs too.
  static setup = TouchSensor.setup;

  autoScrollEnabled = true;

  private activated = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly initial: Point;
  private readonly distance: number;
  private readonly target: HTMLElement;
  private readonly doc: Document;
  private readonly win: Window;
  private readonly props: SensorProps<HoldOrMoveOptions>;

  constructor(props: SensorProps<HoldOrMoveOptions>) {
    this.props = props;
    const event = props.event as TouchEvent;
    const touch = event.touches[0];
    this.initial = { x: touch.clientX, y: touch.clientY };
    // platform: Touch events keep targeting the element the touch began on, even after it leaves the document.
    this.target = event.target as HTMLElement;
    this.doc = this.target.ownerDocument ?? document;
    this.win = this.doc.defaultView ?? window;
    const height = props.activeNode.node.current?.getBoundingClientRect().height ?? 0;
    this.distance = height > 0 ? height / 2 : props.options.distance;

    this.target.addEventListener('touchmove', this.onMove, { passive: false });
    this.target.addEventListener('touchend', this.onEnd);
    this.target.addEventListener('touchcancel', this.onCancel);
    this.win.addEventListener('resize', this.onCancel);
    this.win.addEventListener('visibilitychange', this.onCancel);
    this.win.addEventListener('contextmenu', preventDefault);
    this.win.addEventListener('dragstart', preventDefault);
    this.doc.addEventListener('keydown', this.onKeydown);
    // On the document, because the second finger can land on any element.
    this.doc.addEventListener('touchstart', this.onTouchStart, { capture: true, passive: true });

    this.timer = setTimeout(this.start, props.options.delay);
    props.onPending(props.active, this.constraint(), this.initial);
  }

  private constraint() {
    return { delay: this.props.options.delay, tolerance: Infinity };
  }

  private start = () => {
    if (this.activated) return;
    this.activated = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.doc.addEventListener('click', stopPropagation, { capture: true });
    this.clearSelection();
    this.doc.addEventListener('selectionchange', this.clearSelection);
    this.props.onStart(this.initial);
  };

  private onMove = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const at = { x: touch.clientX, y: touch.clientY };
    if (!this.activated) {
      const delta = { x: this.initial.x - at.x, y: this.initial.y - at.y };
      if (Math.hypot(delta.x, delta.y) > this.distance) {
        this.start();
      } else {
        this.props.onPending(this.props.active, this.constraint(), this.initial, delta);
        return;
      }
    }
    if (e.cancelable) e.preventDefault();
    this.props.onMove(at);
  };

  private onEnd = () => {
    const { onAbort, onEnd, active } = this.props;
    this.detach();
    if (!this.activated) onAbort(active);
    onEnd();
  };

  // platform: A second finger raises no touchcancel, so a touchstart with two touches ends the gesture as a pinch.
  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length > 1) this.onCancel();
  };

  private onCancel = () => {
    const { onAbort, onCancel, active } = this.props;
    this.detach();
    if (!this.activated) onAbort(active);
    onCancel();
  };

  private onKeydown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') this.onCancel();
  };

  private clearSelection = () => {
    this.doc.getSelection()?.removeAllRanges();
  };

  private detach() {
    this.target.removeEventListener('touchmove', this.onMove);
    this.target.removeEventListener('touchend', this.onEnd);
    this.target.removeEventListener('touchcancel', this.onCancel);
    this.doc.removeEventListener('touchstart', this.onTouchStart, { capture: true });
    this.win.removeEventListener('resize', this.onCancel);
    this.win.removeEventListener('visibilitychange', this.onCancel);
    this.win.removeEventListener('contextmenu', preventDefault);
    this.win.removeEventListener('dragstart', preventDefault);
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // platform: The click a release raises arrives after touchend, so the document listeners stay 50 ms longer, as in dnd-kit.
    const { doc, clearSelection, onKeydown } = this;
    setTimeout(() => {
      doc.removeEventListener('click', stopPropagation, { capture: true });
      doc.removeEventListener('selectionchange', clearSelection);
      doc.removeEventListener('keydown', onKeydown);
    }, 50);
  }
}
