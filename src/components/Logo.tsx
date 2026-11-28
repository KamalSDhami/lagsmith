import logo from "../assets/logo.svg";

/** Owner's logo. In dark mode a faint light edge (see .brand-logo in index.css) keeps the grey outline readable; the red is untouched. */
export function LogoMark({ className }: { className?: string }) {
  return <img src={logo} alt="" aria-hidden className={`brand-logo ${className ?? ""}`} />;
}
