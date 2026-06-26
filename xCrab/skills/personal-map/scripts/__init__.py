"""
高德地图个人专属地图客户端
AMap Web API: https://lbs.amap.com/api/webservice/summary
"""

import os
import json
import urllib.request
import urllib.parse
import urllib.error


class AMapPersonalMapClient:
    """高德地图 API 封装类"""

    def __init__(self, api_key=None):
        self.api_key = api_key or os.environ.get("AMAP_API_KEY")
        if not self.api_key:
            raise ValueError("API Key 未设置，请配置 AMAP_API_KEY 环境变量或传入 api_key 参数")
        self.base_url = "https://restapi.amap.com/v3"

    def _get(self, path, params):
        """发送 GET 请求"""
        params["key"] = self.api_key
        url = f"{self.base_url}{path}?{urllib.parse.urlencode(params)}"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            return {"error": "请求失败", "message": str(e)}

    # ========== 地理编码 ==========

    def maps_geo(self, address, city=None):
        """地址转经纬度坐标"""
        params = {"address": address}
        if city:
            params["city"] = city
        result = self._get("/geocode/geo", params)
        if result.get("status") == "1" and result.get("geocodes"):
            geo = result["geocodes"][0]
            location = geo.get("location", "").split(",")
            return {
                "longitude": float(location[0]) if len(location) > 0 else 0,
                "latitude": float(location[1]) if len(location) > 1 else 0,
                "formatted_address": geo.get("formatted_address", address),
                "province": geo.get("province", ""),
                "city": geo.get("city", ""),
                "district": geo.get("district", ""),
            }
        return {"error": "地理编码失败", "message": result.get("info", "未知错误")}

    def maps_regeocode(self, longitude, latitude):
        """经纬度坐标转结构化地址"""
        params = {"location": f"{longitude},{latitude}"}
        result = self._get("/geocode/regeo", params)
        if result.get("status") == "1":
            regeocode = result.get("regeocode", {})
            address = regeocode.get("addressComponent", {})
            return {
                "formatted_address": regeocode.get("formatted_address", ""),
                "province": address.get("province", ""),
                "city": address.get("city", ""),
                "district": address.get("district", ""),
                "township": address.get("township", ""),
            }
        return {"error": "逆地理编码失败", "message": result.get("info", "未知错误")}

    # ========== POI 搜索 ==========

    def maps_text_search(self, keywords, city=None, offset=20):
        """关键词搜索 POI"""
        params = {"keywords": keywords, "offset": offset}
        if city:
            params["city"] = city
        result = self._get("/place/text", params)
        if result.get("status") == "1" and result.get("pois"):
            pois = []
            for poi in result["pois"]:
                location = poi.get("location", "").split(",")
                pois.append({
                    "id": poi.get("id", ""),
                    "name": poi.get("name", ""),
                    "address": poi.get("address", ""),
                    "longitude": float(location[0]) if len(location) > 0 else 0,
                    "latitude": float(location[1]) if len(location) > 1 else 0,
                    "telephone": poi.get("tel", ""),
                    "type": poi.get("type", ""),
                })
            return pois
        return []

    def maps_around_search(self, keywords, location, radius=1000, types=None, offset=20, page=1):
        """周边 POI 搜索"""
        params = {
            "keywords": keywords,
            "location": location,
            "radius": radius,
            "offset": offset,
            "page": page,
        }
        if types:
            params["types"] = types
        result = self._get("/place/around", params)
        if result.get("status") == "1" and result.get("pois"):
            pois = []
            for poi in result["pois"]:
                location = poi.get("location", "").split(",")
                pois.append({
                    "id": poi.get("id", ""),
                    "name": poi.get("name", ""),
                    "address": poi.get("address", ""),
                    "longitude": float(location[0]) if len(location) > 0 else 0,
                    "latitude": float(location[1]) if len(location) > 1 else 0,
                    "distance": poi.get("distance", ""),
                    "telephone": poi.get("tel", ""),
                    "type": poi.get("type", ""),
                })
            return pois
        return []

    # ========== 路径规划 ==========

    def maps_direction_walking(self, origin, destination):
        """步行路线规划"""
        params = {"origin": origin, "destination": destination}
        result = self._get("/direction/walking", params)
        if result.get("status") == "1":
            paths = result.get("route", {}).get("paths", [])
            if paths:
                return {"distance": paths[0].get("distance", ""), "time": paths[0].get("time", ""), "steps": len(paths[0].get("steps", []))}
        return {"error": "路径规划失败", "message": result.get("info", "未知错误")}

    def maps_direction_driving(self, origin, destination):
        """驾车路线规划"""
        params = {"origin": origin, "destination": destination}
        result = self._get("/direction/driving", params)
        if result.get("status") == "1":
            paths = result.get("route", {}).get("paths", [])
            if paths:
                return {"distance": paths[0].get("distance", ""), "time": paths[0].get("time", ""), "steps": len(paths[0].get("steps", []))}
        return {"error": "路径规划失败", "message": result.get("info", "未知错误")}

    def maps_direction_transit_integrated(self, origin, destination, city="北京"):
        """公共交通路线规划"""
        params = {"origin": origin, "destination": destination, "city": city}
        result = self._get("/direction/transit/integrated", params)
        if result.get("status") == "1":
            transits = result.get("route", {}).get("transits", [])
            if transits:
                return {"segments": len(transits[0].get("segments", [])), "duration": transits[0].get("duration", "")}
        return {"error": "路径规划失败", "message": result.get("info", "未知错误")}

    # ========== IP 定位 ==========

    def maps_ip_location(self, ip=None):
        """IP 地址定位"""
        params = {}
        if ip:
            params["ip"] = ip
        result = self._get("/ip", params)
        if result.get("status") == "1":
            return {
                "province": result.get("province", ""),
                "city": result.get("city", ""),
                "district": result.get("district", ""),
                "isp": result.get("isp", ""),
            }
        return {"error": "IP定位失败", "message": result.get("info", "未知错误")}

    # ========== 生成个人地图（核心） ==========

    def maps_schema_personal_map(self, org_name, line_list, scene_type=1):
        """
        生成个人地图小程序二维码
        https://lbs.amap.com/api/wx/scheme-addr
        """
        # 组装 URI 参数
        from urllib.parse import quote
        
        # 编码地图名称
        encoded_name = quote(org_name)
        
        # 构建高德小程序码 URL
        # AMAP_SCHEME_URL 用于生成可唤醒高德地图 App 的 Scheme URL
        scheme_base = f"amapuri://openLocation?src=openApi&name={encoded_name}"
        
        # 如果有路线数据，添加到 URL
        if line_list and len(line_list) > 0:
            points = []
            for line in line_list:
                for point in line.get("pointInfoList", []):
                    points.append(f"{point.get('lon', 0)},{point.get('lat', 0)}")
            if points:
                points_str = "|".join(points)
                encoded_points = quote(points_str)
                scheme_base += f"&points={encoded_points}"
        
        # 生成二维码 API（使用联图二维码API演示）
        qr_api = f"https://api.puncc.cn/qr?text={urllib.parse.quote(scheme_base)}&size=300"
        
        return {
            "qr_code_url": qr_api,
            "scheme_url": scheme_base,
            "org_name": org_name,
            "line_list": line_list,
        }