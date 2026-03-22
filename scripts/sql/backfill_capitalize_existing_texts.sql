begin;

create or replace function pg_temp.compact_multiline(input text)
returns text
language sql
immutable
as $$
  with lines as (
    select ordinality,
           nullif(regexp_replace(trim(line), '\s+', ' ', 'g'), '') as line
    from regexp_split_to_table(coalesce(input, ''), E'\r?\n') with ordinality as t(line, ordinality)
  )
  select nullif(string_agg(line, E'\n' order by ordinality), '')
  from lines
  where line is not null;
$$;

create or replace function pg_temp.title_case_text(input text)
returns text
language plpgsql
immutable
as $$
declare
  result text;
begin
  with lines as (
    select ordinality, pg_temp.compact_multiline(line) as line
    from regexp_split_to_table(coalesce(input, ''), E'\r?\n') with ordinality as t(line, ordinality)
  )
  select nullif(string_agg(initcap(lower(line)), E'\n' order by ordinality), '')
    into result
  from lines
  where line is not null;

  if result is null then
    return null;
  end if;

  result := regexp_replace(result, '\ydni\y', 'DNI', 'gi');
  result := regexp_replace(result, '\yruc\y', 'RUC', 'gi');
  result := regexp_replace(result, '\yce\y', 'CE', 'gi');
  result := regexp_replace(result, '\yimei\y', 'IMEI', 'gi');
  result := regexp_replace(result, '\yram\y', 'RAM', 'gi');
  result := regexp_replace(result, '\yrom\y', 'ROM', 'gi');
  result := regexp_replace(result, '\ygb\y', 'GB', 'gi');
  result := regexp_replace(result, '\ytb\y', 'TB', 'gi');
  result := regexp_replace(result, '\ysim\y', 'SIM', 'gi');
  result := regexp_replace(result, '\yesim\y', 'eSIM', 'gi');
  result := regexp_replace(result, '\yusb\y', 'USB', 'gi');
  result := regexp_replace(result, '\ynfc\y', 'NFC', 'gi');
  result := regexp_replace(result, '\ygps\y', 'GPS', 'gi');
  result := regexp_replace(result, '\yled\y', 'LED', 'gi');
  result := regexp_replace(result, '\yoled\y', 'OLED', 'gi');
  result := regexp_replace(result, '\ylcd\y', 'LCD', 'gi');
  result := regexp_replace(result, '\ybcp\y', 'BCP', 'gi');
  result := regexp_replace(result, '\ybbva\y', 'BBVA', 'gi');
  result := regexp_replace(result, '\yyape\y', 'Yape', 'gi');
  result := regexp_replace(result, '\yplin\y', 'Plin', 'gi');
  result := regexp_replace(result, '\y5g\y', '5G', 'gi');
  result := regexp_replace(result, '\y4g\y', '4G', 'gi');
  result := regexp_replace(result, '\y3g\y', '3G', 'gi');
  result := regexp_replace(result, '([0-9]+)\s*gb\y', '\1GB', 'gi');
  result := regexp_replace(result, '([0-9]+)\s*tb\y', '\1TB', 'gi');
  return result;
end;
$$;

create or replace function pg_temp.sentence_case_text(input text)
returns text
language plpgsql
immutable
as $$
declare
  result text;
begin
  with lines as (
    select ordinality, pg_temp.compact_multiline(line) as line
    from regexp_split_to_table(coalesce(input, ''), E'\r?\n') with ordinality as t(line, ordinality)
  )
  select nullif(
      string_agg(
        case
          when line is null then null
          when line = '' then null
          else upper(left(lower(line), 1)) || substr(lower(line), 2)
        end,
        E'\n' order by ordinality
      ),
      ''
    )
    into result
  from lines
  where line is not null;

  if result is null then
    return null;
  end if;

  result := regexp_replace(result, '\ydni\y', 'DNI', 'gi');
  result := regexp_replace(result, '\yruc\y', 'RUC', 'gi');
  result := regexp_replace(result, '\yce\y', 'CE', 'gi');
  result := regexp_replace(result, '\yimei\y', 'IMEI', 'gi');
  result := regexp_replace(result, '\yram\y', 'RAM', 'gi');
  result := regexp_replace(result, '\yrom\y', 'ROM', 'gi');
  result := regexp_replace(result, '\ygb\y', 'GB', 'gi');
  result := regexp_replace(result, '\ytb\y', 'TB', 'gi');
  result := regexp_replace(result, '\ysim\y', 'SIM', 'gi');
  result := regexp_replace(result, '\yesim\y', 'eSIM', 'gi');
  result := regexp_replace(result, '\yusb\y', 'USB', 'gi');
  result := regexp_replace(result, '\ynfc\y', 'NFC', 'gi');
  result := regexp_replace(result, '\ygps\y', 'GPS', 'gi');
  result := regexp_replace(result, '\yled\y', 'LED', 'gi');
  result := regexp_replace(result, '\yoled\y', 'OLED', 'gi');
  result := regexp_replace(result, '\ylcd\y', 'LCD', 'gi');
  result := regexp_replace(result, '\ybcp\y', 'BCP', 'gi');
  result := regexp_replace(result, '\ybbva\y', 'BBVA', 'gi');
  result := regexp_replace(result, '\yyape\y', 'Yape', 'gi');
  result := regexp_replace(result, '\yplin\y', 'Plin', 'gi');
  result := regexp_replace(result, '\y5g\y', '5G', 'gi');
  result := regexp_replace(result, '\y4g\y', '4G', 'gi');
  result := regexp_replace(result, '\y3g\y', '3G', 'gi');
  result := regexp_replace(result, '([0-9]+)\s*gb\y', '\1GB', 'gi');
  result := regexp_replace(result, '([0-9]+)\s*tb\y', '\1TB', 'gi');
  return result;
end;
$$;

update public.profiles
set full_name = pg_temp.title_case_text(full_name)
where full_name is not null
  and full_name <> pg_temp.title_case_text(full_name);

update public.customers
set full_name = pg_temp.title_case_text(full_name),
    address = pg_temp.title_case_text(address)
where (full_name is not null and full_name <> pg_temp.title_case_text(full_name))
   or (address is not null and address <> pg_temp.title_case_text(address));

update public.products
set name = pg_temp.title_case_text(name),
    description = pg_temp.sentence_case_text(description),
    color = pg_temp.title_case_text(color),
    location_bin = pg_temp.title_case_text(location_bin)
where (name is not null and name <> pg_temp.title_case_text(name))
   or (description is not null and description <> pg_temp.sentence_case_text(description))
   or (color is not null and color <> pg_temp.title_case_text(color))
   or (location_bin is not null and location_bin <> pg_temp.title_case_text(location_bin));

update public.brands
set name = pg_temp.title_case_text(name)
where name is not null
  and name <> pg_temp.title_case_text(name);

update public.models
set name = pg_temp.title_case_text(name)
where name is not null
  and name <> pg_temp.title_case_text(name);

update public.suppliers
set name = pg_temp.title_case_text(name)
where name is not null
  and name <> pg_temp.title_case_text(name);

update public.stores
set name = pg_temp.title_case_text(name)
where name is not null
  and name <> pg_temp.title_case_text(name);

update public.inventory_locations
set name = pg_temp.title_case_text(name)
where name is not null
  and name <> pg_temp.title_case_text(name);

update public.categories
set name = pg_temp.title_case_text(name)
where name is not null
  and name <> pg_temp.title_case_text(name);

update public.payment_methods
set name = pg_temp.title_case_text(name)
where name is not null
  and name <> pg_temp.title_case_text(name);

update public.company_receipt_settings
set header_text = pg_temp.sentence_case_text(header_text)
where header_text is not null
  and header_text <> pg_temp.sentence_case_text(header_text);

update public.advances
set target_product_name = pg_temp.title_case_text(target_product_name),
    notes = pg_temp.sentence_case_text(notes)
where (target_product_name is not null and target_product_name <> pg_temp.title_case_text(target_product_name))
   or (notes is not null and notes <> pg_temp.sentence_case_text(notes));

update public.advance_movements
set notes = pg_temp.sentence_case_text(notes)
where notes is not null
  and notes <> pg_temp.sentence_case_text(notes);

update public.purchase_order_items
set product_name = pg_temp.title_case_text(product_name),
    brand = pg_temp.title_case_text(brand),
    model = pg_temp.title_case_text(model),
    specifications = pg_temp.sentence_case_text(specifications),
    notes = pg_temp.sentence_case_text(notes)
where (product_name is not null and product_name <> pg_temp.title_case_text(product_name))
   or (brand is not null and brand <> pg_temp.title_case_text(brand))
   or (model is not null and model <> pg_temp.title_case_text(model))
   or (specifications is not null and specifications <> pg_temp.sentence_case_text(specifications))
   or (notes is not null and notes <> pg_temp.sentence_case_text(notes));

commit;
