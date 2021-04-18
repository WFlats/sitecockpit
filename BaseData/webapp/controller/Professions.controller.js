sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/Sorter",
	"sap/ui/model/FilterOperator",
	"sap/m/GroupHeaderListItem"
], function (BaseController, JSONModel, Filter, Sorter, FilterOperator, GroupHeaderListItem) {
	"use strict";

	return BaseController.extend("base.data.BaseData.controller.Professions", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				professionID: "",
				listTitle: ""
			});
			this.setModel(oViewModel, "professionView");
		},

		onProfessionListUpdateFinished: function (oEvent) {
			var oList = this.getView().byId("professionsList"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("professionView");

			if (oList.getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("detailProfessionTableHeadingCount", [iTotalItems]);
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
				aFilters = [new Filter("description", FilterOperator.Contains, sQuery)];
			}

			this.byId("professionsList").getBinding("items").filter(aFilters, "Application");

		},

		onRefresh: function () {
			this.byId("professionsList").getBinding("items").refresh();
		},

		/**
		 *@memberOf base.data.BaseDataEditor.controller.Disciplines
		 */
		onAddProfession: function (oEvent) {
			this.getRouter().getTargets().display("CreateProfession", {
				objectId: "",
				mode: "Create"
			});
		},

		/**
		 *@memberOf base.data.BaseDataEditor.controller.Disciplines
		 */
		onEditProfession: function (oEvent) {
			var oDisciplineBC = oEvent.getSource().getBindingContext(),
				sDisciplineID = oDisciplineBC.getProperty("ID");

			this.getRouter().getTargets().display("CreateProfession", {
				objectId: sDisciplineID,
				mode: "Edit"
			});
		},

		getDiscipline: function (oContext) {
			var oDiscipline = oContext.getProperty("discipline"),
				oGroup;
			if (!oDiscipline) {
				oGroup = {
					key: "   ",
					description: this.getResourceBundle().getText("groupTextNoDisciplineAssigned")
				};
			} else {
				oGroup = {
					key: oDiscipline.code,
					description: oDiscipline.description
				};
			}
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			var sText = oGroup.key + " " + oGroup.description;
			return new GroupHeaderListItem({
				title: sText,
				upperCase: false
			});
		},

		onNavBack: function () {
			this.getRouter().getTargets().display("Selector");
		}

	});

});