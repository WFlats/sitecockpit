sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/ui/model/FilterOperator",
	"sap/m/GroupHeaderListItem"
], function (BaseController, JSONModel, Filter, Sorter, FilterOperator, GroupHeaderListItem) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.Companies", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				mode: "",
				companyID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "companyView");
		},

		onCompanyListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("companyList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("companyView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("companyTableHeadingCount", [iTotalItems]);
			}
			oViewModel.setProperty("/listTitle", sTitle);
			oViewModel.setProperty("/busy", false);
		},

		onSearch: function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}

			var sQuery = oEvent.getParameter("query"),
				aFilters = [];

			if (sQuery) {
				aFilters = [new Filter("companyName", FilterOperator.Contains, sQuery)];
			}

			this.byId("companyList").getBinding("items").filter(aFilters, "Application");

		},

		onRefresh: function () {
			this.byId("companyList").getBinding("items").refresh();
		},

		onAddCompany: function (oEvent) {
			this.getRouter().getTargets().display("CreateCompany", {
				objectId: "",
				mode: "Create"
			});
		},

		onEditCompany: function (oEvent) {
			var oCompanyBC = oEvent.getSource().getBindingContext(),
				sCompanyID = oCompanyBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateCompany", {
				objectId: sCompanyID,
				mode: "Edit"
			});
		},

		/*		getCompany: function (oContext) {
					var oCompany = oContext.getProperty("company"),
						oGroup = {
							key: oCompany.companyName
						};
					return oGroup;
				},

				createGroupHeader: function (oGroup) {
					var sText = oGroup.key;
					return new GroupHeaderListItem({
						title: sText,
						upperCase: false
					});
				}, */

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});