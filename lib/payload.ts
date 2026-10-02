import { effectiveShape, requiredDimensions } from "./shapes";
import { DIMENSION_FIELDS, type CreateRfqDto, type DimensionField, type ExtractedLine, type ExtractedRfq, type RfqLineDto } from "./schema";

const MAX_CERTIFICATIONS = 10;

const DTO_DIMENSION: Record<DimensionField, keyof RfqLineDto> = {
  thickness_in: "thickness",
  width_in: "width",
  length_in: "length",
  height_in: "height",
  diameter_in: "diameter",
  outer_diameter_in: "outer_diameter",
  outer_dimension_in: "outer_dimension",
  wall_thickness_in: "wall_thickness",
};

export function buildPayload(rfq: ExtractedRfq): CreateRfqDto {
  return compact({
    subject: buildSubject(rfq),
    job_number: rfq.job_number.value,
    customer: compactOrUndefined({
      name: rfq.customer.name.value,
      company: rfq.customer.company.value,
      email: rfq.customer.email.value,
      phone: rfq.customer.phone.value,
    }),
    ship_to_address: rfq.ship_to_address.value,
    bill_to_address: rfq.bill_to_address.value,
    lines: rfq.lines.flatMap((line) => {
      const dto = buildLine(line, rfq);
      return dto ? [dto] : [];
    }),
  });
}

function buildSubject(rfq: ExtractedRfq): string | null {
  const parts = [
    rfq.po_number.value && `PO ${rfq.po_number.value}`,
    rfq.customer.company.value,
    rfq.required_date.value && `need by ${rfq.required_date.value}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function buildLine(line: ExtractedLine, rfq: ExtractedRfq): RfqLineDto | null {
  const alloy = line.alloy.value;
  const quantity = line.quantity.value;
  if (!alloy || quantity === null) return null;

  return compact({
    ref: line.ref,
    alloy,
    product_type: line.product_type.value,
    shape: effectiveShape(line),
    temper: line.temper.value,
    ...dimensions(line),
    requested_quantity: quantity,
    compliance: line.compliance.value,
    job_detail: buildJobDetail(line, rfq),
    certifications: line.certifications.length
      ? line.certifications.slice(0, MAX_CERTIFICATIONS).map(({ family, designation }) => ({ family, designation }))
      : null,
  });
}

function dimensions(line: ExtractedLine): Partial<RfqLineDto> {
  const shape = effectiveShape(line);
  const productType = line.product_type.value;
  const fields = (productType && shape && requiredDimensions(productType, shape)) || DIMENSION_FIELDS;
  return Object.fromEntries(
    fields.filter((f) => line[f].value !== null).map((f) => [DTO_DIMENSION[f], line[f].value]),
  );
}

function buildJobDetail(line: ExtractedLine, rfq: ExtractedRfq): string | null {
  const parts = [
    rfq.po_number.value && `PO ${rfq.po_number.value}`,
    line.customer_part_number.value && `Cust P/N ${line.customer_part_number.value}`,
    line.cut_tolerance.value && `Cut tol ${line.cut_tolerance.value}`,
    rfq.required_date.value && `Need by ${rfq.required_date.value}`,
    rfq.mill_certs_required.value && "Mill certs (MTR) required",
    line.notes,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

type Compacted<T> = { [K in keyof T]: Exclude<T[K], null> };

function compact<T extends object>(obj: T): Compacted<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== null && value !== undefined && value !== ""),
  ) as Compacted<T>;
}

function compactOrUndefined<T extends object>(obj: T): Compacted<T> | undefined {
  const result = compact(obj);
  return Object.keys(result).length ? result : undefined;
}
