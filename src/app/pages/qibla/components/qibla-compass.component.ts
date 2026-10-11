import { Component, input, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-qibla-compass',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="compass-wrapper" [class.compass-wrapper--marker-only]="fixed()">
      <!-- The Kaaba above the dial: the arrow points at it once you face the Qibla -->
      <div class="qibla-point">
        <svg class="qibla-point-svg" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" preserveAspectRatio="xMidYMid meet">
          <path d="M18 0L0 5v29l18 2l18-2V5z" fill="#000000"></path>
          <path fill="#292F33" d="M18 36l18-2V5L18 0z"></path>
          <path fill="#FFD983" d="M22.454 14.507v3.407l4.229.612V15.22zm7 1.181v3.239l3.299.478v-3.161zM18 13.756v3.513l1.683.244V14.04zm18 3.036l-.539-.091v3.096l.539.078z"></path>
          <path fill="#FFAC33" d="M0 16.792v3.083l.539-.078v-3.096zm16.317-2.752v3.473L18 17.269v-3.513zm-13.07 2.204v3.161l3.299-.478v-3.239zm6.07-1.024v3.306l4.229-.612v-3.407z"></path>
          <path fill="#FFD983" d="M21.389 15.131v-.042c0-.421-.143-.763-.32-.763c-.177 0-.32.342-.32.763v.042c-.208.217-.355.621-.355 1.103c0 .513.162.949.393 1.152c.064.195.163.33.282.33s.218-.135.282-.33c.231-.203.393-.639.393-1.152c-.001-.482-.147-.886-.355-1.103zm6.999 1.069v-.042c0-.421-.143-.763-.32-.763c-.177 0-.32.342-.32.763v.042c-.208.217-.355.621-.355 1.103c0 .513.162.949.393 1.152c.064.195.163.33.282.33s.218-.135.282-.33c.231-.203.393-.639.393-1.152c0-.481-.147-.885-.355-1.103zm6.017 1.03v-.039c0-.393-.134-.712-.299-.712c-.165 0-.299.319-.299.712v.039c-.194.203-.331.58-.331 1.03c0 .479.151.886.367 1.076c.059.182.152.308.263.308s.203-.126.263-.308c.215-.189.367-.597.367-1.076c0-.45-.136-.827-.331-1.03z"></path>
          <path fill="#FFAC33" d="M14.611 15.131v-.042c0-.421.143-.763.32-.763s.32.342.32.763v.042c.208.217.355.621.355 1.103c0 .513-.162.949-.393 1.152c-.064.195-.163.33-.282.33s-.218-.135-.282-.33c-.231-.203-.393-.639-.393-1.152c.001-.482.147-.886.355-1.103zM7.612 16.2v-.042c0-.421.143-.763.32-.763s.32.342.32.763v.042c.208.217.355.621.355 1.103c0 .513-.162.949-.393 1.152c-.064.195-.163.33-.282.33s-.218-.135-.282-.33c-.231-.203-.393-.639-.393-1.152c0-.481.147-.885.355-1.103zm-6.017 1.03v-.039c0-.393.134-.712.299-.712s.299.319.299.712v.039c.194.203.331.58.331 1.03c0 .479-.151.886-.367 1.076c-.059.182-.152.308-.263.308s-.204-.127-.264-.308c-.215-.189-.367-.597-.367-1.076c.001-.45.137-.827.332-1.03zM0 11.146v3.5l18-3.268V7.614z"></path>
          <path fill="#FFD983" d="M18 7.614v3.764l18 3.268v-3.5z"></path>
        </svg>
      </div>
      <!-- The dial needs a compass to turn it: a device without one shows only the marker -->
      @if (!fixed()) {
        <div class="compass-container">
          <div
            class="compass-svg-wrapper"
            [style.transform]="'rotate(' + compassRotation() + 'deg)'"
          >
            <svg class="compass-svg" viewBox="0 0 745 740.19" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="shape-rendering:geometricPrecision; text-rendering:geometricPrecision; image-rendering:optimizeQuality; fill-rule:evenodd; clip-rule:evenodd">
              <g>
                <g>
                  <g>
                    <line fill="none" stroke="#ffb030" stroke-width="5.34" stroke-miterlimit="2.61313" x1="666.29" y1="364.83" x2="74.02" y2="364.83" />
                    <line fill="none" stroke="#ffb030" stroke-width="5.34" stroke-miterlimit="2.61313" x1="370.16" y1="67.28" x2="370.16" y2="662.38" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="323.93" y1="101.42" x2="416.38" y2="628.23" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="279.12" y1="113.49" x2="461.19" y2="616.17" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="237.07" y1="133.19" x2="503.24" y2="596.46" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="199.06" y1="159.93" x2="541.25" y2="569.72" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="166.25" y1="192.9" x2="574.06" y2="536.75" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="139.64" y1="231.09" x2="600.67" y2="498.56" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="120.03" y1="273.35" x2="620.28" y2="456.31" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="108.02" y1="318.38" x2="632.29" y2="411.27" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="416.38" y1="101.42" x2="323.93" y2="628.23" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="461.19" y1="113.49" x2="279.12" y2="616.17" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="503.24" y1="133.19" x2="237.07" y2="596.46" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="600.67" y1="231.09" x2="139.64" y2="498.56" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="541.25" y1="159.93" x2="199.06" y2="569.72" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="620.28" y1="273.35" x2="120.03" y2="456.31" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="574.06" y1="192.9" x2="166.25" y2="536.75" />
                    <line fill="none" stroke="#874d14" stroke-width="0.67" stroke-miterlimit="2.61313" x1="632.29" y1="318.38" x2="108.02" y2="411.27" />
                  </g>
                  <ellipse fill="#ffffff" stroke="#874d14" stroke-width="4.01" stroke-miterlimit="2.61313" cx="370.16" cy="364.83" rx="241.57" ry="244.02"/>
                </g>
                <circle fill="none" stroke="#ffb030" stroke-width="10.68" stroke-miterlimit="2.61313" cx="372.48" cy="366.6" r="297.77"/>
                <polygon fill="none" stroke="#874d14" stroke-width="13.35" stroke-miterlimit="2.61313" points="209.99,199.31 302.4,199.31 370.34,130.35 437.28,199.31 532.4,199.31 532.4,297.32 597.47,364.36 532.4,430.41 532.4,529.03 435.24,529.03 368.63,596.64 303.02,529.03 209.99,529.03 209.99,433.17 141.51,362.62 209.99,293.11 "/>
                <path fill="#ffb030" stroke="#ffb030" stroke-width="0.67" stroke-miterlimit="2.61313" d="M369.76 202.4l-76.11 113.67c47.82,-47.51 97.27,-50.18 150.16,0l-74.05 -113.67z"/>
                <ellipse fill="#ffffff" stroke="#ffb030" stroke-width="13.35" stroke-miterlimit="2.61313" cx="368.75" cy="362.23" rx="84.01" ry="82.23"/>
                <g transform="translate(360 362) scale(0.5355) translate(-87 -371)">
                  <path fill="#874d14" d="M61.11,306.155c0-6.695,5.427-12.122,12.122-12.122c0.151,0,0.298,0.017,0.447,0.023
                    c0.439-21.88,24.359-22.002,29.237-33.848c4.878,11.846,28.798,11.968,29.237,33.848c0.15-0.005,0.296-0.023,0.447-0.023
                    c6.695,0,12.122,5.427,12.122,12.122c6.695,0,12.122,5.427,12.122,12.122v149.891H48.988V318.277
                    C48.988,311.582,54.415,306.155,61.11,306.155z"/>
                </g>
              </g>
            </svg>
          </div>
        </div>
      }
    </div>
  `,
  styleUrls: ['./qibla-compass.component.css']
})
export class QiblaCompassComponent {
  readonly qiblaBearing = input<number>(0);
  readonly currentHeading = input<number | null>(0);
  /** No compass on this device: no dial, only the Kaaba marker above where it would be */
  readonly fixed = input(false);

  readonly compassRotation = computed<number>(() => {
    const bearing = this.qiblaBearing();
    const heading = this.currentHeading();

    if (heading === null || heading === undefined) {
      const rotation = bearing % 360;
      return Math.round(rotation * 10) / 10;
    }

    const rotation = (bearing - heading + 360) % 360;
    return Math.round(rotation * 10) / 10;
  });
}
