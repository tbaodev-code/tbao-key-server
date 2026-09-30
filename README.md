# TBAO TEAM License Management v2

Node/Express + PostgreSQL, designed for Render Free web services.

Features: admin login, create keys, edit, add days, ban/unban, delete, HWID registration, check-key/validate API.

IMPORTANT: Render Free web services have an ephemeral filesystem, so keys are stored in PostgreSQL instead of SQLite/files. Free Render Postgres currently expires after 30 days; for longer retention use a paid database or another persistent PostgreSQL provider.

Environment variables: DATABASE_URL, ADMIN_USER, ADMIN_PASS, SESSION_SECRET, NODE_ENV=production.
Hãy nâng cấp toàn bộ giao diện và UX của project theo các yêu cầu dưới đây. Không làm qua loa, không chỉ thêm vài CSS media query.

## 1. THÊM Ô TÌM KIẾM

Thêm một ô tìm kiếm hoàn chỉnh vào giao diện.

Yêu cầu:

* Có icon tìm kiếm.
* Có placeholder rõ ràng.
* Tìm kiếm realtime khi người dùng nhập.
* Có thể tìm theo tên, ID, key hoặc các dữ liệu phù hợp với nội dung hiện tại.
* Kết quả được lọc ngay lập tức, không cần reload trang.
* Có trạng thái khi không tìm thấy kết quả.
* Giao diện ô tìm kiếm phải đồng bộ với design hiện tại.
* Trên mobile phải tối ưu riêng, không được làm ô tìm kiếm quá nhỏ hoặc gây vỡ layout.

## 2. THIẾT KẾ MOBILE RIÊNG

Đây là yêu cầu QUAN TRỌNG:

KHÔNG được hiểu “mobile responsive” là chỉ thêm vài media query để thu nhỏ giao diện desktop.

Hãy thiết kế một UI MOBILE RIÊNG, có bố cục và UX được tối ưu cho màn hình điện thoại.

Mobile phải được xem như một layout riêng biệt.

Yêu cầu:

* Thiết kế lại header/navigation cho mobile.
* Các khu vực chức năng phải được sắp xếp lại theo chiều dọc hợp lý.
* Card, bảng dữ liệu, form và các component phải được thiết kế lại cho màn hình nhỏ.
* Không để bảng bị tràn ngang một cách xấu.
* Không để chữ quá nhỏ.
* Không để nút hoặc input bị sát nhau.
* Kích thước vùng bấm phải phù hợp với thao tác bằng ngón tay.
* Khoảng cách, padding, typography phải được tối ưu riêng cho mobile.
* Modal/popup phải phù hợp với màn hình điện thoại.
* Search phải có trải nghiệm mobile riêng.
* Navigation desktop nếu không phù hợp thì phải chuyển thành mobile navigation/bottom navigation/drawer tùy cấu trúc project.
* Ưu tiên UX một tay.
* Không làm mất bất kỳ chức năng quan trọng nào của desktop.
* Desktop và mobile phải có trải nghiệm rõ ràng, chuyên nghiệp và đồng nhất về design system.

Hãy kiểm tra các breakpoint phổ biến như:

* 320px
* 375px
* 390px
* 430px
* 768px
* Desktop

Không được chỉ scale toàn bộ giao diện desktop xuống mobile.

## 3. DESIGN

Giữ phong cách hiện tại của project nhưng nâng cấp UI theo hướng:

* Modern
* Premium
* Clean
* Professional
* Smooth
* Responsive
* Mobile-first UX
* Dark/Light theme nếu project hiện tại đã hỗ trợ

Các trạng thái hover, focus, active, loading, empty state, error state cũng phải được xử lý đẹp.

Không lạm dụng animation.

## 4. API DOCUMENTATION ĐƠN GIẢN

Thêm một khu vực “Hướng dẫn sử dụng API” thật đơn giản để người dùng có thể dùng API từ tool/app khác.

Không viết tài liệu API dài dòng.

Chỉ cần giải thích những thứ người dùng thực sự cần:

### API Endpoint

Hiển thị:

* Base URL
* Endpoint
* Method: GET/POST/PUT/DELETE
* Authentication nếu có
* Content-Type nếu cần

### Ví dụ sử dụng

Cho một ví dụ request đơn giản bằng cURL:

```bash
curl -X GET "https://YOUR-DOMAIN.com/api/..."
```

Nếu API yêu cầu API Key thì minh họa:

```bash
curl -X GET "https://YOUR-DOMAIN.com/api/..." \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Người dùng cần làm gì để sử dụng API?

Chỉ giải thích ngắn gọn theo kiểu:

1. Lấy API Key.
2. Copy Base URL.
3. Gửi request tới Endpoint.
4. Thêm API Key vào header nếu API yêu cầu.
5. Nhận JSON response.

Nếu có nhiều endpoint thì tạo bảng:

| Method | Endpoint | Chức năng   | Auth     |
| ------ | -------- | ----------- | -------- |
| GET    | /api/... | Lấy dữ liệu | Có/Không |
| POST   | /api/... | Tạo dữ liệu | Có/Không |
| DELETE | /api/... | Xóa dữ liệu | Có/Không |

Không yêu cầu người dùng phải hiểu backend phức tạp.

## 5. API PHẢI DỄ DÙNG TỪ TOOL KHÁC

Mục tiêu là một tool khác chỉ cần biết:

* API URL
* API Key nếu cần
* Endpoint
* Method
* Parameters/body

là có thể gọi API.

Không được bắt người dùng phụ thuộc vào frontend để sử dụng API.

API phải trả JSON rõ ràng

## 6. QUAN TRỌNG

Trước khi sửa code:

* Kiểm tra cấu trúc project hiện tại.
* Xác định frontend đang dùng framework/library gì.
* Giữ nguyên các chức năng đang hoạt động.
* Không tự ý xóa chức năng cũ.
* Không tạo code trùng lặp.
* Tái sử dụng component/style hiện có nếu hợp lý.

Sau khi hoàn thành:

* Kiểm tra toàn bộ desktop UI.
* Kiểm tra toàn bộ mobile UI.
* Kiểm tra search.
* Kiểm tra API.
* Kiểm tra các trạng thái loading/error/empty.
* Đảm bảo không có lỗi console.
* Đảm bảo không có overflow ngang trên mobile.

MỤC TIÊU CUỐI CÙNG:

Tôi muốn đây là một giao diện có:

1. Desktop UI hoàn chỉnh.
2. Mobile UI được thiết kế riêng, không phải responsive sơ sài.
3. Search box hoàn chỉnh.
4. API documentation cực kỳ đơn giản.
5. API có thể được sử dụng trực tiếp từ tool/app khác chỉ bằng URL + API Key + endpoint + request.
6. UI đẹp, hiện đại và chuyên nghiệp.
