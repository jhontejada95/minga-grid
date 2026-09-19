import { AgreementView } from "@/components/agreement/AgreementView";

export default function AgreementPage({ params }: { params: { address: string } }) {
  return <AgreementView address={params.address} />;
}
