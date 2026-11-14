// About, Terms, Privacy, Refund and Cancellation pages.
import { CONFIG } from '../config.js';
import { esc } from '../ui.js';

const UPDATED = '14 November 2026';
const isSet = v => !!v && !String(v).startsWith('PASTE');
const todo = label => `<mark class="todo">[add ${label}]</mark>`;
const val = (v, label) => (isSet(v) ? esc(v) : todo(label));
const biz = () => val(CONFIG.BUSINESS_NAME, 'your business name');
const addr = () => val(CONFIG.ADDRESS, 'your address');
const city = () => val(CONFIG.CITY, 'your city');
const mail = () => (isSet(CONFIG.SUPPORT_EMAIL)
  ? `<a href="mailto:${esc(CONFIG.SUPPORT_EMAIL)}">${esc(CONFIG.SUPPORT_EMAIL)}</a>` : todo('your support email'));

function doc(root, title, body, { updated = true } = {}) {
  root.innerHTML = `
  <article class="legal">
    <h1>${esc(title)}</h1>
    ${updated ? `<p class="updated">Last updated: ${UPDATED}</p>` : ''}
    ${body}
  </article>`;
  document.title = `${title} - GolpoTune`;
}

export function about(root) {
  doc(root, 'About GolpoTune', `
    <p class="lead">GolpoTune is your favourite audio station for stories. Thrillers, horror, mystery, romance, fantasy, drama and more, told in a voice and ready to listen to wherever you are.</p>

    <h2>What you can do</h2>
    <ul>
      <li>Discover and listen to stories, many of them free.</li>
      <li>Save favourite stories, build playlists and keep bookmarks and notes for the moments you love.</li>
      <li>Pick up exactly where you stopped, on any device where you are logged in.</li>
      <li>Change the playback speed, set a sleep timer, and keep listening while you browse.</li>
    </ul>

    <h2>Free and Premium</h2>
    <p><b>Free membership</b> gives you free stories, your personal profile, favourites, playlists, listening history and the standard player.</p>
    <p><b>Premium membership</b> includes everything in Free, plus access to Premium-exclusive stories and offline downloads where available. Premium is a subscription. You never buy individual stories or books on GolpoTune.</p>

    <h2>No ads, ever</h2>
    <p>GolpoTune is completely ad-free, for Free and Premium members alike.</p>

    <h2>Our stories</h2>
    <p>Every story on GolpoTune is added and managed by the GolpoTune team. Listeners cannot upload or publish stories.</p>

    <h2>Contact us</h2>
    <p>GolpoTune is operated by ${biz()}.</p>
    <p>Email: ${mail()}<br>Address: ${addr()}</p>
  `, { updated: false });
}

export function terms(root) {
  doc(root, 'Terms of Use', `
    <p>Welcome to GolpoTune. These Terms of Use explain the rules for using our website and services. By creating an account or using GolpoTune, you agree to them. If you do not agree, please do not use the service.</p>

    <h2>1. Who we are</h2>
    <p>GolpoTune is operated by ${biz()} ("GolpoTune", "we", "us"). You can reach us at ${mail()}.</p>

    <h2>2. Who can use GolpoTune</h2>
    <p>You must be at least 18 years old, or use GolpoTune with the consent and supervision of a parent or legal guardian who accepts these terms for you.</p>

    <h2>3. Your account</h2>
    <ul>
      <li>Give us correct information when you sign up, and keep it up to date in your profile.</li>
      <li>Keep your password private. You are responsible for what happens under your account.</li>
      <li>Verify your email address when we ask you to. Tell us at once if you think someone else is using your account.</li>
      <li>One account is for one person. Please do not share your login.</li>
    </ul>

    <h2>4. Listening to stories</h2>
    <p>Stories on GolpoTune are for your personal, non-commercial listening only. You may not copy, record, download (except through a download feature we provide), re-upload, sell, share publicly or otherwise redistribute our audio, cover images or descriptions. You may not try to get around the way we protect Premium content.</p>

    <h2>5. Free and Premium membership</h2>
    <ul>
      <li>Free members can listen to free stories. Premium members can also listen to Premium stories.</li>
      <li>Premium is a subscription that gives access to Premium content for the period you have paid for. It is not a purchase of any individual story.</li>
      <li>The price, billing period and what is included are shown before you subscribe. Paid plans may not be open yet. We will tell you on the site when they start.</li>
      <li>Please read our <a href="#/refund">Refund Policy</a> and <a href="#/cancellation">Cancellation Policy</a>.</li>
    </ul>

    <h2>6. What you must not do</h2>
    <ul>
      <li>Break the law or the rights of others while using GolpoTune.</li>
      <li>Try to hack, overload, scrape or disturb the service, or access another person's account or data.</li>
      <li>Use bots or automated tools to listen, to copy content or to create accounts.</li>
      <li>Use GolpoTune to send spam or harmful content.</li>
    </ul>

    <h2>7. Our content and your data</h2>
    <p>The stories, narration, cover art, design and the GolpoTune name and logo belong to us or to the people who license them to us. Using GolpoTune does not give you ownership of any of it.</p>
    <p>Information you add, such as playlists, favourites and bookmark notes, stays yours. You allow us to store it so we can run the service for you. How we handle your information is explained in our <a href="#/privacy">Privacy Policy</a>.</p>

    <h2>8. Availability and changes</h2>
    <p>We work to keep GolpoTune running smoothly, but we cannot promise it will always be available or error-free. We may add, change or remove stories and features, for example when a licence ends or for maintenance.</p>

    <h2>9. Suspending or closing accounts</h2>
    <p>You can stop using GolpoTune at any time. We may suspend or close an account that breaks these terms or harms the service or other people. If we close a paid account without a breach on your side, we will refund the unused part of what you paid.</p>

    <h2>10. Our responsibility</h2>
    <p>GolpoTune is provided "as is". To the extent the law allows, we are not responsible for indirect or incidental losses, or for interruptions outside our control, such as internet or power failures or problems with third-party services. Nothing in these terms limits any right you have under law that cannot be limited, including your rights as a consumer.</p>

    <h2>11. Changes to these terms</h2>
    <p>We may update these terms from time to time. The date at the top shows the latest version. If a change is important, we will tell you on the site or by email. Using GolpoTune after a change means you accept it.</p>

    <h2>12. Governing law</h2>
    <p>These terms are governed by the laws of India. Disputes will be handled by the courts at ${city()}, India, subject to any rights you have as a consumer to approach other courts.</p>

    <h2>13. Contact</h2>
    <p>Questions about these terms? Write to ${mail()}.</p>
  `);
}

export function privacy(root) {
  doc(root, 'Privacy Policy', `
    <p>Your privacy matters to us. This policy explains what information GolpoTune collects, why, and the choices you have. It applies to the GolpoTune website and services run by ${biz()}.</p>

    <h2>1. Information we collect</h2>
    <ul>
      <li><b>Account details:</b> your name, email address and password. Your password is stored in a protected form. We cannot see it.</li>
      <li><b>Profile details you choose to add:</b> gender, age, city, state, country and your favourite genres. These are optional. You can skip them at signup and change or remove them later in your profile.</li>
      <li><b>Listening information:</b> your favourites, playlists, bookmarks and notes, listening progress, listening history, playback speed and other settings.</li>
      <li><b>Membership information:</b> whether you are a Free or Premium member and for how long.</li>
      <li><b>Payment information:</b> when paid plans start, payments will be handled by a payment provider. We do not store your card or bank details. We receive only the payment status and a reference.</li>
      <li><b>Technical information:</b> basic details such as browser type and device, and records our hosting provider keeps to run and secure the service.</li>
    </ul>

    <h2>2. How we use your information</h2>
    <ul>
      <li>To create and run your account, and to verify your email.</li>
      <li>To save your library and let you resume stories where you stopped.</li>
      <li>To suggest stories you may like, using your favourite genres, favourites and listening history.</li>
      <li>To manage your membership and, later, payments and refunds.</li>
      <li>To keep GolpoTune safe, fix problems and improve the service.</li>
      <li>To reply to you when you contact us, and to send service messages such as email verification and password reset.</li>
    </ul>
    <p><b>We do not show ads and we do not sell your personal information.</b></p>

    <h2>3. Who handles your information</h2>
    <p>We use trusted companies to run GolpoTune. They process information only to provide their service to us:</p>
    <ul>
      <li><b>Supabase</b> for accounts, login and our database.</li>
      <li><b>Cloudflare</b> for hosting the website and storing story audio and images.</li>
      <li>A <b>payment provider</b>, once paid plans start.</li>
    </ul>
    <p>We may also share information if the law requires it, or to protect the rights and safety of our users and the service.</p>

    <h2>4. Browser storage</h2>
    <p>GolpoTune stores small pieces of information in your browser so the site works well, such as your login session and your playback speed and volume. We do not use advertising trackers.</p>

    <h2>5. How long we keep information</h2>
    <p>We keep your information while your account is active. If you ask us to delete your account, we delete or anonymise your personal information, except what we must keep by law, for example payment records.</p>

    <h2>6. Your choices and rights</h2>
    <ul>
      <li>See and edit your name, personal details and favourite genres at any time in your profile.</li>
      <li>Ask us for a copy of your information, ask us to correct it, or ask us to delete your account and information.</li>
      <li>Withdraw your consent for optional information at any time.</li>
      <li>Make a complaint about how we handle your information, as the Digital Personal Data Protection Act, 2023 allows.</li>
    </ul>
    <p>To use these rights, write to ${mail()}. We will reply within a reasonable time.</p>

    <h2>7. Children</h2>
    <p>GolpoTune is meant for people aged 18 and over, or younger people using it with a parent or guardian's consent. If you believe a child has given us information without such consent, please contact us and we will delete it.</p>

    <h2>8. Security</h2>
    <p>We protect your information with secure connections and access controls. Your personal data can only be read by you, and by our authorised team where needed to run the service. No online service can be completely risk-free, so please keep your password safe.</p>

    <h2>9. Changes to this policy</h2>
    <p>We may update this policy. The date at the top shows the latest version. We will tell you about important changes on the site or by email.</p>

    <h2>10. Contact and grievances</h2>
    <p>For any privacy question, request or complaint, contact ${biz()}:<br>Email: ${mail()}<br>Address: ${addr()}</p>
  `);
}

export function refund(root) {
  doc(root, 'Refund Policy', `
    <p>This policy explains when you can get your money back for a GolpoTune Premium subscription. GolpoTune never sells individual stories, so this policy covers membership payments only.</p>
    <p class="callout">Premium plans may not be open yet. This policy applies from the day paid plans start.</p>

    <h2>1. General rule</h2>
    <p>Premium gives you immediate access to Premium stories as soon as your payment succeeds. Because of this, subscription payments are generally not refundable once Premium has been activated and used.</p>

    <h2>2. When we will refund you</h2>
    <ul>
      <li><b>Payment taken, Premium not activated:</b> your money was deducted but Premium did not start on your account.</li>
      <li><b>Duplicate or wrong charge:</b> you were charged more than once for the same plan, or charged an amount different from the price shown.</li>
      <li><b>Service problem on our side:</b> you could not use Premium for a long period because of a fault on our side that we could not fix.</li>
      <li><b>Account closed by us without a breach of our terms:</b> we refund the unused part of the period you paid for.</li>
    </ul>

    <h2>3. How to ask for a refund</h2>
    <p>Email ${mail()} within 7 days of the payment. Please include the email address of your GolpoTune account, the date and amount of the payment, the payment reference, and a short note on what went wrong. A screenshot helps.</p>

    <h2>4. How long it takes</h2>
    <p>We will review your request and reply within 5 working days. Approved refunds are sent back to the original payment method. They usually reach you within 5 to 10 working days after approval, depending on your bank or payment provider.</p>

    <h2>5. What we cannot refund</h2>
    <ul>
      <li>Change of mind after Premium has been used.</li>
      <li>Partial months after you cancel. Cancelling stops future charges. See our <a href="#/cancellation">Cancellation Policy</a>.</li>
      <li>Problems caused by your own device, internet connection or a third-party service.</li>
      <li>Accounts closed because of a breach of our <a href="#/terms">Terms of Use</a>.</li>
    </ul>

    <h2>6. Contact</h2>
    <p>${biz()}<br>Email: ${mail()}<br>Address: ${addr()}</p>
  `);
}

export function cancellation(root) {
  doc(root, 'Cancellation Policy', `
    <p>This policy explains how to cancel your GolpoTune Premium membership and what happens afterwards.</p>
    <p class="callout">Premium plans may not be open yet. This policy applies from the day paid plans start.</p>

    <h2>1. You can cancel at any time</h2>
    <p>There is no lock-in. You can cancel your Premium membership whenever you like. Until in-app cancellation is available on your account page, write to ${mail()} from the email address of your account and we will cancel it for you, normally within 2 working days.</p>

    <h2>2. What happens after you cancel</h2>
    <ul>
      <li>You keep Premium until the end of the period you have already paid for.</li>
      <li>You will not be charged again after that period.</li>
      <li>Your account then returns to the Free membership. Your profile, favourites, playlists, bookmarks and listening history are kept.</li>
      <li>You can still listen to all free stories. Premium stories will need Premium again.</li>
    </ul>

    <h2>3. Refunds after cancelling</h2>
    <p>Cancelling stops future charges but does not refund the current period. Refunds are only given in the cases listed in our <a href="#/refund">Refund Policy</a>.</p>

    <h2>4. Automatic renewal</h2>
    <p>If a plan renews automatically, we will clearly say so, and show the price and billing period, before you pay. To avoid the next charge, cancel before the renewal date.</p>

    <h2>5. Closing your whole account</h2>
    <p>To delete your GolpoTune account and your personal information, email ${mail()} from your account email. Any active Premium plan is cancelled at the same time, and we will refund the unused period if the Refund Policy allows it.</p>

    <h2>6. If we cancel or change a plan</h2>
    <p>If we stop offering Premium, or close your account without a breach of our <a href="#/terms">Terms of Use</a>, we will refund the unused part of your paid period. We will give notice before changing the price of an existing plan, and you can cancel before the change starts.</p>

    <h2>7. Contact</h2>
    <p>${biz()}<br>Email: ${mail()}<br>Address: ${addr()}</p>
  `);
}
