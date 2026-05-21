import { passwordRules, type PasswordPolicyContext } from "@shared/contracts/password-policy";

type Props = {
  password: string;
  context?: PasswordPolicyContext;
};

export function PasswordChecklist({ password, context = {} }: Props) {
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {passwordRules.map((rule) => {
        const met = rule.test(password, context);
        return (
          <li key={rule.id} className={met ? "text-foreground" : undefined}>
            <span aria-hidden="true">{met ? "✓" : "○"} </span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}
