# TaskFlow

Ứng dụng quản lý công việc cá nhân dùng React, Cloudflare Workers và D1. Có thể chạy chatbot TaskFlow AI cục bộ với Ollama; không gọi Ollama từ production.

## Chạy local

Yêu cầu Node.js/npm và Ollama đang chạy:

```sh
npm install
ollama pull qwen2.5:3b
cp .dev.vars.example .dev.vars
npm run db:migrate
npm run dev
```

Mở URL Vite hiển thị trong terminal, tạo tài khoản và chọn **TaskFlow AI** ở menu bên trái. Mặc định Worker gọi `http://127.0.0.1:11434` với model `qwen2.5:3b`. Có thể cấu hình `OLLAMA_BASE_URL` và `OLLAMA_MODEL` trong `.dev.vars`.

Chatbot chỉ truy vấn công việc thuộc tài khoản đang đăng nhập. Đề xuất tạo/sửa công việc và checklist không được ghi vào D1 khi chat; người dùng phải bấm **Xác nhận và lưu**. Endpoint xác nhận kiểm tra quyền sở hữu, trường dữ liệu và category trước khi thực hiện.

## Kiểm tra

```sh
npm run typecheck
npm run build
npm run test
```

Không deploy Worker/D1 remote để sử dụng Ollama trên máy cá nhân. Ollama ở `localhost` chỉ có thể được Worker chạy cùng máy truy cập; bản Cloudflare production hiện không có kết nối tới Ollama local.

## Cloudflare

Tạo D1, cấu hình binding `DB` và áp dụng migrations trước khi deploy. `npm run deploy` deploy lên Cloudflare; không chạy lệnh này cho chatbot local nếu chưa chủ động muốn phát hành.
