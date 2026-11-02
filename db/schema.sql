-- MiliMarket(군장터) PostgreSQL 스키마 v1
-- 원칙: 원본(출처별 값)과 채택값을 분리하고, 모르는 값은 NULL로 둔다(0이나 추정값으로 채우지 않음).
-- 대상: PostgreSQL 14+ / 필수 확장: pg_trgm (PostgreSQL 기본 contrib, 폐쇄망 설치 가능)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. 적재 이력: 엑셀 가져오기·나라장터 수집·공공 API 호출 1회 = 1행
-- ---------------------------------------------------------------------------
CREATE TABLE source_batch (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('excel_ocr','excel_db_applied','g2b_shop','g2b_api','mfds_api','manual')),
  source_name   text NOT NULL,                 -- 파일명 또는 출처명
  source_url    text,
  sha256        char(64),                      -- 파일 원본 해시(엑셀)
  row_count     integer,
  collected_at  timestamptz NOT NULL,          -- 원본 수집 시점
  loaded_at     timestamptz NOT NULL DEFAULT now(),
  note          text
);

-- ---------------------------------------------------------------------------
-- 2. 분류: 대분류(육류 등) → 세부 식품유형(양념육 등) 2단계
-- ---------------------------------------------------------------------------
CREATE TABLE category (
  id         serial PRIMARY KEY,
  parent_id  integer REFERENCES category(id),
  name       text NOT NULL,
  UNIQUE NULLS NOT DISTINCT (parent_id, name)
);

-- ---------------------------------------------------------------------------
-- 3. 상품: 물품식별번호 1개 = 1행. 엑셀 정리본 기준 마스터
-- ---------------------------------------------------------------------------
CREATE TABLE product (
  id              bigint PRIMARY KEY,            -- 물품식별번호
  name            text NOT NULL,
  category_id     integer NOT NULL REFERENCES category(id),  -- 세부 분류(대분류는 parent)
  food_type_raw   text,                          -- 식품유형 원문 (미제공 → NULL)
  ingredients     text,                          -- 원재료명 원문 (미제공 → NULL, '없음'으로 해석 금지)
  report_number_raw text,                        -- 품목제조보고번호 셀 원문
  storage_type    text CHECK (storage_type IN ('냉동','냉장','상온')),  -- 명시된 경우만
  pack_grams      numeric(12,3) CHECK (pack_grams > 0),     -- 제품명에서 단일 질량만 추출
  pack_label      text,                          -- 추출 근거 문구 또는 '규격 확인 필요'
  source_batch_id bigint NOT NULL REFERENCES source_batch(id),
  source_row      integer,                       -- 엑셀 행 번호
  is_active       boolean NOT NULL DEFAULT true, -- 목록에서 빠진 상품은 삭제하지 않고 비활성
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  search_text     text GENERATED ALWAYS AS (
                    id::text || ' ' || name || ' ' || coalesce(food_type_raw,'') || ' ' || coalesce(ingredients,'') || ' ' || coalesce(report_number_raw,'')
                  ) STORED
);
CREATE INDEX product_category_idx ON product (category_id);
CREATE INDEX product_search_trgm  ON product USING gin (search_text gin_trgm_ops);
CREATE INDEX product_name_trgm    ON product USING gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 4. 품목제조보고번호: 한 셀에 공장별 번호가 여러 개 → 1:N
-- ---------------------------------------------------------------------------
CREATE TABLE product_report_number (
  product_id   bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  seq          smallint NOT NULL,              -- 셀 안에서의 순서
  number_text  text NOT NULL,                  -- 분리한 번호 원문 (하이픈 등 포함)
  factory_tag  text,                           -- F1, P2 등 공장 표기
  normalized   text NOT NULL,                  -- 숫자만 남긴 번호 (식약처 DB 매칭 키)
  PRIMARY KEY (product_id, seq)
);
CREATE INDEX report_number_normalized_idx ON product_report_number (normalized);

-- ---------------------------------------------------------------------------
-- 5. 영양정보: 출처별로 별도 행. 화면에는 adopted=true 1건만 사용
-- ---------------------------------------------------------------------------
CREATE TABLE nutrition_record (
  id              bigserial PRIMARY KEY,
  product_id      bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN ('ocr_label','food_db_excel','mfds_api','manual')),
  source_batch_id bigint REFERENCES source_batch(id),
  basis_amount    numeric(10,3),                 -- 기준량 (예: 100)
  basis_unit      text CHECK (basis_unit IN ('g','ml','serving','package')),  -- 모르면 NULL
  energy_kcal     numeric(10,3),
  carbs_g         numeric(10,3),
  sugars_g        numeric(10,3),
  protein_g       numeric(10,3),
  fat_g           numeric(10,3),
  sodium_mg       numeric(10,3),
  calcium_mg      numeric(10,3),
  raw             jsonb,                         -- 원문 문자열 그대로 ({"탄수화물":"6g", ...})
  matched_report_number text,                    -- 식약처 DB와 연결한 번호 (해당 시)
  review_status   text NOT NULL DEFAULT 'unreviewed'
                    CHECK (review_status IN ('unreviewed','approved','rejected','hold')),
  adopted         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nutrition_product_idx ON nutrition_record (product_id);
CREATE UNIQUE INDEX nutrition_one_adopted ON nutrition_record (product_id) WHERE adopted;

-- ---------------------------------------------------------------------------
-- 6. 공급업체 / 나라장터 판매 조건(수집 1회당 1행 → 가격 이력)
-- ---------------------------------------------------------------------------
CREATE TABLE supplier (
  id    serial PRIMARY KEY,
  name  text NOT NULL UNIQUE
);

CREATE TABLE market_offer (
  id               bigserial PRIMARY KEY,
  product_id       bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  source_batch_id  bigint NOT NULL REFERENCES source_batch(id),
  supplier_id      integer REFERENCES supplier(id),
  market_name      text NOT NULL,              -- 나라장터 표시 상품명
  sale_unit        text NOT NULL,              -- 개, 봉지, kg ...
  unit_grams       numeric(12,3) CHECK (unit_grams > 0),  -- 판매 단위 중량 (확정 가능할 때만)
  unit_price       numeric(14,2) CHECK (unit_price >= 0), -- 표시 단가, 미확인 시 NULL
  price_text       text,                       -- 원문 ("590원")
  original_price   numeric(14,2),
  discount_text    text,
  sale_start       date,
  sale_end         date,
  contract_end     date,
  purchase_method  text,                       -- 다수공급자계약 등
  origin           text,
  delivery         text,
  region           text,
  minimum_order    integer,
  image_url        text,
  source_category  text,                       -- 수집한 나라장터 분류명
  source_page      integer,
  unavailable      boolean NOT NULL DEFAULT false,
  collected_at     timestamptz NOT NULL,
  UNIQUE (product_id, source_batch_id, supplier_id, sale_unit, price_text)
);
CREATE INDEX market_offer_product_idx ON market_offer (product_id, collected_at DESC);

-- 화면용 현재 판매 조건: 상품별 최신 수집분 중 계약 유효·판매 가능한 최저가
-- (기존 build_market.py의 선택 규칙과 동일. 유효 항목이 없으면 단가 NULL로 노출)
CREATE VIEW current_offer AS
WITH latest AS (
  SELECT o.*, rank() OVER (PARTITION BY o.product_id ORDER BY o.source_batch_id DESC) AS r
  FROM market_offer o
), ranked AS (
  SELECT l.*,
         (NOT l.unavailable AND coalesce(l.contract_end, DATE '9999-12-31') >= current_date) AS live,
         row_number() OVER (
           PARTITION BY l.product_id
           ORDER BY (NOT l.unavailable AND coalesce(l.contract_end, DATE '9999-12-31') >= current_date) DESC,
                    l.unit_price ASC NULLS LAST, l.id
         ) AS pick,
         count(*) OVER (PARTITION BY l.product_id) AS offer_count
  FROM latest l WHERE l.r = 1
)
SELECT id AS offer_id, product_id, supplier_id, market_name, sale_unit, unit_grams,
       CASE WHEN live THEN unit_price END AS unit_price,
       CASE WHEN live AND unit_grams IS NOT NULL AND unit_price IS NOT NULL
            THEN round(unit_price / unit_grams * 1000, 2) END AS price_per_kg,
       original_price, discount_text, sale_start, sale_end, contract_end, purchase_method,
       origin, delivery, region, minimum_order, image_url, collected_at, offer_count, live
FROM ranked WHERE pick = 1;

-- ---------------------------------------------------------------------------
-- 7. 관리자 검토: 번호 매칭·나라장터 매칭·영양값 등 애매한 연결의 승인/보류 이력
-- ---------------------------------------------------------------------------
CREATE TABLE match_review (
  id            bigserial PRIMARY KEY,
  product_id    bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('report_number','market_offer','nutrition','category','pack_grams')),
  candidate     jsonb NOT NULL,                -- 후보 값/근거 (상대 DB 레코드 키, 유사도 등)
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','hold')),
  note          text,
  reviewed_by   bigint,                        -- app_user.id (아래에서 FK 추가)
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX match_review_open_idx ON match_review (kind, status) WHERE status IN ('pending','hold');

-- ---------------------------------------------------------------------------
-- 8. 선호도: 급양대 여론조사·품평회·시중 리뷰. 가상 데이터는 반드시 is_synthetic=true
-- ---------------------------------------------------------------------------
CREATE TABLE preference_score (
  id            bigserial PRIMARY KEY,
  product_id    bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  source        text NOT NULL CHECK (source IN ('unit_survey','tasting','public_review')),
  source_detail text,                          -- 예: 53급양대 2026-09 조사, 쿠팡
  score         numeric(5,2) NOT NULL,
  scale_max     numeric(5,2) NOT NULL DEFAULT 5,
  sample_size   integer,
  surveyed_on   date,
  is_synthetic  boolean NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (score >= 0 AND score <= scale_max)
);
CREATE INDEX preference_product_idx ON preference_score (product_id);

-- ---------------------------------------------------------------------------
-- 9. 사용자·발주 검토 목록 (현재 localStorage → 서버 저장으로 전환할 때)
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
  id            bigserial PRIMARY KEY,
  login_id      text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  unit_name     text,                          -- 소속 부대/급양대
  role          text NOT NULL DEFAULT 'staff' CHECK (role IN ('staff','admin')),
  default_people integer CHECK (default_people BETWEEN 1 AND 100000),
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE match_review ADD FOREIGN KEY (reviewed_by) REFERENCES app_user(id);

-- 상품별 배식 설정 (order-preferences.ts의 SavedQuote). signature가 바뀌면 적용하지 않음
CREATE TABLE serving_setting (
  user_id           bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  product_id        bigint NOT NULL REFERENCES product(id) ON DELETE CASCADE,
  signature         text NOT NULL,             -- [판매명, 판매단위, 단위중량] 스냅샷
  mode              text NOT NULL CHECK (mode IN ('weight','count')),
  portion_grams     numeric(10,3) CHECK (portion_grams > 0),
  pack_grams        numeric(12,3) CHECK (pack_grams > 0),
  units_per_person  numeric(10,3) CHECK (units_per_person > 0),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE order_list (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  title       text NOT NULL,
  people      integer NOT NULL CHECK (people BETWEEN 1 AND 100000),
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','saved','exported')),  -- 실제 발주 전송 상태 없음
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 저장 시점 값을 스냅샷으로 보존 (이후 가격이 바뀌어도 검토 근거 유지)
CREATE TABLE order_list_item (
  order_list_id     bigint NOT NULL REFERENCES order_list(id) ON DELETE CASCADE,
  product_id        bigint NOT NULL REFERENCES product(id),
  offer_id          bigint REFERENCES market_offer(id),
  mode              text NOT NULL CHECK (mode IN ('weight','count')),
  portion_grams     numeric(10,3) CHECK (portion_grams > 0),
  units_per_person  numeric(10,3) CHECK (units_per_person > 0),
  pack_grams        numeric(12,3) CHECK (pack_grams > 0),
  unit_price        numeric(14,2) CHECK (unit_price >= 0),
  price_source      text NOT NULL CHECK (price_source IN ('market','manual')),
  price_collected_at timestamptz,             -- 조회 단가일 때 수집 시점
  packs             integer CHECK (packs >= 0),   -- 올림 결과
  total_price       numeric(16,2),
  sort_order        smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (order_list_id, product_id),
  CHECK ((mode = 'weight' AND portion_grams IS NOT NULL) OR (mode = 'count' AND units_per_person IS NOT NULL))
);

-- ---------------------------------------------------------------------------
-- 10. 화면 조회용 뷰: 기존 products.json + market-enrichment.json 구조와 1:1 대응
-- ---------------------------------------------------------------------------
CREATE VIEW product_card AS
SELECT p.id, p.name, parent.name AS category, c.name AS subcategory,
       p.food_type_raw, p.ingredients, p.storage_type, p.pack_grams, p.pack_label,
       p.report_number_raw,
       n.basis_amount, n.basis_unit, n.carbs_g, n.sugars_g, n.protein_g, n.fat_g, n.sodium_mg, n.calcium_mg,
       o.unit_price, o.price_per_kg, o.sale_unit, o.unit_grams, o.image_url, s.name AS supplier,
       o.origin, o.purchase_method, o.contract_end, o.collected_at AS price_collected_at
FROM product p
JOIN category c ON c.id = p.category_id
JOIN category parent ON parent.id = c.parent_id
LEFT JOIN nutrition_record n ON n.product_id = p.id AND n.adopted
LEFT JOIN current_offer o ON o.product_id = p.id
LEFT JOIN supplier s ON s.id = o.supplier_id
WHERE p.is_active;

-- ---------------------------------------------------------------------------
-- 1인 하루 영양 기준: 출처 원문 값과 통합 규칙을 분리한다.
-- 원본: shared/nutrition-standards.mjs → db/seed_nutrition_standards.sql (scripts/export_nutrition_standards.mjs로 생성)
-- ---------------------------------------------------------------------------
CREATE TABLE nutrition_standard_source (
  code       text PRIMARY KEY,                 -- mnd(국방부) / mfds(식약처) / kdri(보건복지부)
  name       text NOT NULL,
  edition    text NOT NULL,                    -- 고시·발간 판, 대상 연령·성별
  url        text NOT NULL,
  verified   boolean NOT NULL,                 -- 공식 원문 대조 여부 (국방부 기준은 보도 기준이라 false)
  note       text
);
-- 출처 원문 그대로의 값 (열량 비례 환산 전)
CREATE TABLE nutrition_standard_value (
  source_code  text NOT NULL REFERENCES nutrition_standard_source(code),
  nutrient     text NOT NULL CHECK (nutrient IN ('calories','protein','fat','carbs','sugars','sodium','calcium')),
  kind         text NOT NULL,                  -- energy / energy_ratio / daily_value / eer / amdr / rni / ul / cdrr / limit_ratio
  value        numeric,
  min_value    numeric,
  max_value    numeric,
  unit         text NOT NULL,
  label        text NOT NULL,
  PRIMARY KEY (source_code, nutrient, kind)
);
-- 통합 규칙: ratio는 열량 비례(g 환산), limit·absolute는 고정, energy는 열량 목표
CREATE TABLE nutrition_standard_rule (
  version          text NOT NULL,
  nutrient         text NOT NULL,
  rule_type        text NOT NULL CHECK (rule_type IN ('energy','ratio','limit','absolute')),
  min_value        numeric,                    -- limit·absolute의 하한
  max_value        numeric,                    -- limit·absolute의 상한
  min_percent      numeric,                    -- ratio의 에너지비율 하한(%)
  max_percent      numeric,                    -- ratio의 에너지비율 상한(%)
  min_source       text REFERENCES nutrition_standard_source(code),
  max_source       text REFERENCES nutrition_standard_source(code),
  basis            text NOT NULL,
  PRIMARY KEY (version, nutrient)
);
